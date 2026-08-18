<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AdminSubscription;
use App\Services\Payment\RelworxService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SubscriptionController extends Controller
{
    const MONTHLY_FEE = 20000;

    public function __construct(protected RelworxService $relworx) {}

    public function renew(Request $request)
    {
        $data = $request->validate([
            'phone_number' => 'required|string|min:10',
            'months'       => 'required|integer|min:1|max:12',
        ]);

        $admin     = $request->user();
        $amount    = $data['months'] * self::MONTHLY_FEE;
        $reference = 'SUB-' . time() . '-' . random_int(100, 999);

        AdminSubscription::create([
            'admin_id'     => $admin->id,
            'amount'       => $amount,
            'months'       => $data['months'],
            'phone_number' => $data['phone_number'],
            'status'       => 'pending',
            'reference'    => $reference,
        ]);

        $result = $this->relworx->requestPayment(
            $reference,
            $data['phone_number'],
            (float) $amount,
            "Subscription Renewal ({$data['months']} months)"
        );

        if (!$result['success']) {
            AdminSubscription::where('reference', $reference)->update(['status' => 'failed']);
            return response()->json(['error' => $result['message'] ?? 'Payment gateway failed.'], 400);
        }

        return response()->json([
            'message'   => 'Payment request initiated.',
            'status'    => 'pending',
            'reference' => $reference,
        ]);
    }

    public function status(Request $request, string $reference)
    {
        $sub = AdminSubscription::where('reference', $reference)
            ->where('admin_id', $request->user()->id)
            ->firstOrFail();

        if (in_array($sub->status, ['success', 'failed'], true)) {
            return response()->json(['status' => $sub->status]);
        }

        $result = $this->relworx->checkRequestStatus($reference);

        if ($result['status'] === 'SUCCESS') {
            $this->fulfill($sub);
            return response()->json(['status' => 'success']);
        }

        if ($result['status'] === 'FAILED') {
            $sub->update(['status' => 'failed']);
            return response()->json(['status' => 'failed']);
        }

        return response()->json(['status' => 'pending']);
    }

    public function fulfillPublic(AdminSubscription $sub): void
    {
        $this->fulfill($sub);
    }

    protected function fulfill(AdminSubscription $sub): void
    {
        DB::transaction(function () use ($sub) {
            if ($sub->status === 'success') {
                return;
            }

            $sub->update(['status' => 'success']);

            $admin = $sub->admin;
            $base  = $admin->subscription_expiry && $admin->subscription_expiry->isFuture()
                ? $admin->subscription_expiry
                : now();

            $admin->update([
                'subscription_expiry' => $base->copy()->addMonths($sub->months),
            ]);
        });
    }
}
