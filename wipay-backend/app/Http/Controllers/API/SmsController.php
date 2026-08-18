<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\SmsFee;
use App\Models\SmsLog;
use App\Services\Payment\RelworxService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SmsController extends Controller
{
    public function __construct(protected RelworxService $relworx) {}

    public function balance(Request $request)
    {
        $balance = $this->calculateBalance($request->user()->id);
        return response()->json(['balance' => $balance]);
    }

    public function logs(Request $request)
    {
        $logs = SmsLog::where('admin_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json($logs);
    }

    public function buy(Request $request)
    {
        $data = $request->validate([
            'amount'       => 'required|numeric|min:100',
            'phone_number' => 'required|string|min:10',
        ]);

        $admin     = $request->user();
        $reference = 'SMS-' . time() . '-' . random_int(100, 999);

        SmsFee::create([
            'admin_id'    => $admin->id,
            'amount'      => $data['amount'],
            'type'        => 'deposit',
            'description' => 'Pending top up via ' . $data['phone_number'],
            'status'      => 'pending',
            'reference'   => $reference,
            'created_at'  => now(),
        ]);

        $result = $this->relworx->requestPayment(
            $reference,
            $data['phone_number'],
            (float) $data['amount'],
            'SMS Topup'
        );

        if (!$result['success']) {
            SmsFee::where('reference', $reference)->update(['status' => 'failed']);
            return response()->json(['error' => $result['message'] ?? 'Payment gateway failed.'], 400);
        }

        return response()->json([
            'message'   => 'Payment request initiated. Please check your phone.',
            'status'    => 'pending',
            'reference' => $reference,
        ]);
    }

    public function status(Request $request, string $reference)
    {
        $fee = SmsFee::where('reference', $reference)
            ->where('admin_id', $request->user()->id)
            ->firstOrFail();

        if (in_array($fee->status, ['success', 'failed'], true)) {
            return response()->json(['status' => $fee->status]);
        }

        $result = $this->relworx->checkRequestStatus($reference);

        if ($result['status'] === 'SUCCESS') {
            $this->markDepositSuccess($fee);
            return response()->json(['status' => 'success']);
        }

        if ($result['status'] === 'FAILED') {
            $fee->update(['status' => 'failed']);
            return response()->json(['status' => 'failed']);
        }

        return response()->json(['status' => 'pending']);
    }

    protected function markDepositSuccess(SmsFee $fee): void
    {
        DB::transaction(function () use ($fee) {
            $fee->update(['status' => 'success']);

            $admin = $fee->admin;
            if ($admin) {
                $admin->update([
                    'sms_balance' => $this->calculateBalance($admin->id),
                ]);
            }
        });
    }

    protected function calculateBalance(int $adminId): float
    {
        $sum = SmsFee::where('admin_id', $adminId)
            ->where(function ($q) {
                $q->where('status', 'success')->orWhereNull('status');
            })
            ->sum('amount');

        return max(0, round((float) $sum, 2));
    }
}
