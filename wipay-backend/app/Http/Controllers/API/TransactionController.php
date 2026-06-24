<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Models\Voucher;
use App\Models\Package;
use App\Models\SmsFee;
use App\Models\AdminSubscription;
use App\Models\RadCheck;
use App\Services\Payment\RelworxService;
use App\Services\SMSService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TransactionController extends Controller
{
    public function __construct(
        protected RelworxService $relworx,
        protected SMSService $sms
    ) {}

    // ---- List Transactions (Admin Panel) ----
    public function index(Request $request)
    {
        $query = Transaction::with(['package', 'router'])
            ->where('admin_id', $request->user()->id)
            ->orderBy('created_at', 'desc');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        return response()->json($query->paginate(25));
    }

    // ---- Initiate Purchase (from Captive Portal) ----
    public function initiatePurchase(Request $request)
    {
        $data = $request->validate([
            'phone_number' => 'required|string',
            'package_id'   => 'required|exists:packages,id',
            'admin_id'     => 'required|exists:admins,id',
        ]);

        $package = Package::findOrFail($data['package_id']);

        // Check a voucher is available
        $voucher = Voucher::where('package_id', $package->id)
            ->where('is_used', false)
            ->lockForUpdate()
            ->first();

        if (!$voucher) {
            return response()->json(['error' => 'No vouchers available for this package.'], 422);
        }

        $reference = 'TXN-' . time() . '-' . Str::random(6);

        // Create pending transaction
        $transaction = Transaction::create([
            'admin_id'        => $data['admin_id'],
            'package_id'      => $package->id,
            'transaction_ref' => $reference,
            'phone_number'    => $data['phone_number'],
            'amount'          => $package->price,
            'status'          => 'pending',
            'payment_method'  => 'mobile_money',
        ]);

        // Call Relworx
        $result = $this->relworx->requestPayment(
            $reference,
            $data['phone_number'],
            $package->price,
            "WiPay: {$package->name} package"
        );

        if (!$result['success']) {
            $transaction->update(['status' => 'failed']);
            return response()->json(['error' => $result['message']], 422);
        }

        return response()->json([
            'transaction_id' => $reference,
            'message'        => 'Payment request sent. Please approve on your phone.',
        ]);
    }

    // ---- Poll Payment Status ----
    public function checkStatus(Request $request)
    {
        $request->validate(['transaction_ref' => 'required|string']);

        $transaction = Transaction::where('transaction_ref', $request->transaction_ref)->firstOrFail();

        // If already confirmed, return immediately
        if ($transaction->status === 'success') {
            return response()->json([
                'status'       => 'SUCCESS',
                'voucher_code' => $transaction->voucher_code,
            ]);
        }

        if ($transaction->status === 'failed') {
            return response()->json(['status' => 'FAILED']);
        }

        // Active poll Relworx
        $result = $this->relworx->checkRequestStatus($transaction->transaction_ref);

        if ($result['status'] === 'SUCCESS') {
            $this->fulfillTransaction($transaction);
        }

        $fresh = $transaction->fresh();

        return response()->json([
            'status'       => strtoupper($fresh->status),
            'voucher_code' => $fresh->voucher_code,
        ]);
    }

    // ---- Relworx Webhook Callback ----
    public function webhook(Request $request)
    {
        $reference = $request->input('reference') ?? $request->input('internal_reference');
        $status    = strtoupper($request->input('status', ''));

        Log::info('[Webhook] Received', $request->all());

        if (!$reference) {
            return response()->json(['error' => 'No reference provided'], 400);
        }

        // SMS top-up
        if (str_starts_with($reference, 'SMS-')) {
            $fee = SmsFee::where('reference', $reference)->first();
            if ($fee && $fee->status === 'pending') {
                if ($status === 'SUCCESS') {
                    $fee->update(['status' => 'success']);
                    $fee->admin?->update(['sms_balance' => SmsFee::where('admin_id', $fee->admin_id)
                        ->where(fn ($q) => $q->where('status', 'success')->orWhereNull('status'))
                        ->sum('amount')]);
                } elseif (in_array($status, ['FAILED', 'CANCELLED'])) {
                    $fee->update(['status' => 'failed']);
                }
            }
            return response()->json(['ok' => true]);
        }

        // Subscription renewal
        if (str_starts_with($reference, 'SUB-')) {
            $sub = AdminSubscription::where('reference', $reference)->first();
            if ($sub && $sub->status === 'pending') {
                if ($status === 'SUCCESS') {
                    app(SubscriptionController::class)->fulfillPublic($sub);
                } elseif (in_array($status, ['FAILED', 'CANCELLED'])) {
                    $sub->update(['status' => 'failed']);
                }
            }
            return response()->json(['ok' => true]);
        }

        $transaction = Transaction::where('transaction_ref', $reference)->first();

        if (!$transaction || $transaction->status === 'success') {
            return response()->json(['ok' => true]);
        }

        if ($status === 'SUCCESS') {
            $this->fulfillTransaction($transaction);
        } elseif (in_array($status, ['FAILED', 'CANCELLED'])) {
            $transaction->update(['status' => 'failed']);
        }

        return response()->json(['ok' => true]);
    }

    // ---- Internal: Assign voucher & notify ----
    protected function fulfillTransaction(Transaction $transaction): void
    {
        DB::transaction(function () use ($transaction) {
            // Lock an unused voucher
            $voucher = Voucher::where('package_id', $transaction->package_id)
                ->where('is_used', false)
                ->lockForUpdate()
                ->first();

            if (!$voucher) {
                Log::error('[Fulfillment] No available vouchers for transaction ' . $transaction->id);
                $transaction->update(['status' => 'failed']);
                return;
            }

            // Mark voucher as used
            $voucher->update([
                'is_used'  => true,
                'used_by'  => $transaction->phone_number,
                'used_at'  => now(),
            ]);

            // Update transaction
            $transaction->update([
                'status'       => 'success',
                'voucher_code' => $voucher->code,
            ]);

            // Send SMS with voucher code
            $package = Package::find($transaction->package_id);
            $msg = "Payment Received! Your voucher code for {$package->name} is: {$voucher->code}. Enjoy your internet!";

            $this->sms->send($transaction->phone_number, $msg, $transaction->admin_id);

            Log::info('[Fulfillment] Fulfilled transaction ' . $transaction->id . ' with voucher ' . $voucher->code);
        });
    }
}
