<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Voucher;
use App\Models\Package;
use App\Models\RadCheck;
use App\Models\RadReply;
use App\Models\RadUserGroup;
use App\Models\SmsFee;
use App\Services\SMSService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VoucherController extends Controller
{
    const SMS_COST = 35;

    public function __construct(protected SMSService $sms) {}
    // List vouchers for the authenticated admin
    public function index(Request $request)
    {
        $query = Voucher::with('package')
            ->where('admin_id', $request->user()->id)
            ->orderBy('created_at', 'desc');

        if ($request->filled('package_id')) {
            $query->where('package_id', $request->package_id);
        }

        if ($request->filled('is_used')) {
            $query->where('is_used', (bool)$request->is_used);
        }

        $vouchers = $query->paginate(50);

        return response()->json($vouchers);
    }

    // Generate batch vouchers for a package
    public function generate(Request $request)
    {
        $data = $request->validate([
            'package_id' => 'required|exists:packages,id',
            'quantity'   => 'required|integer|min:1|max:500',
            'prefix'     => 'nullable|string|max:10',
        ]);

        $admin = $request->user();
        $package = Package::where('admin_id', $admin->id)->findOrFail($data['package_id']);
        $prefix = strtoupper($data['prefix'] ?? '');
        $generated = [];

        for ($i = 0; $i < $data['quantity']; $i++) {
            $code = $prefix . strtolower(Str::random(8));

            // Ensure uniqueness
            while (Voucher::where('code', $code)->exists()) {
                $code = $prefix . strtolower(Str::random(8));
            }

            $voucher = Voucher::create([
                'admin_id'   => $admin->id,
                'package_id' => $package->id,
                'code'       => $code,
            ]);

            // Sync to FreeRADIUS
            $this->syncToRadius($voucher, $package);

            $generated[] = $voucher;
        }

        return response()->json([
            'message'   => "Generated {$data['quantity']} vouchers.",
            'vouchers'  => $generated,
        ], 201);
    }

    // Delete a single voucher (removes it from RADIUS too)
    public function destroy(Request $request, $id)
    {
        $voucher = Voucher::where('admin_id', $request->user()->id)->findOrFail($id);

        $this->deleteFromRadius($voucher->code);
        $voucher->delete();

        return response()->json(['message' => 'Voucher deleted.']);
    }

    // Delete all unused vouchers for a package
    public function bulkDelete(Request $request)
    {
        $request->validate(['package_id' => 'required|exists:packages,id']);

        $vouchers = Voucher::where('admin_id', $request->user()->id)
            ->where('package_id', $request->package_id)
            ->where('is_used', false)
            ->get();

        foreach ($vouchers as $voucher) {
            $this->deleteFromRadius($voucher->code);
            $voucher->delete();
        }

        return response()->json(['message' => "Deleted {$vouchers->count()} unused vouchers."]);
    }

    // Sell a voucher manually and send via SMS
    public function sell(Request $request)
    {
        $data = $request->validate([
            'package_id'   => 'required|exists:packages,id',
            'phone_number' => 'required|string|min:10',
        ]);

        $admin = $request->user();

        return DB::transaction(function () use ($data, $admin) {
            $balance = (float) SmsFee::where('admin_id', $admin->id)
                ->where(fn ($q) => $q->where('status', 'success')->orWhereNull('status'))
                ->sum('amount');

            if ($balance < self::SMS_COST) {
                return response()->json([
                    'error' => "Insufficient SMS balance. Cost: " . self::SMS_COST . ", Balance: {$balance}",
                ], 400);
            }

            $package = Package::where('admin_id', $admin->id)->findOrFail($data['package_id']);

            $voucher = Voucher::where('package_id', $package->id)
                ->where('admin_id', $admin->id)
                ->where('is_used', false)
                ->lockForUpdate()
                ->first();

            if (!$voucher) {
                return response()->json(['error' => 'No vouchers available for this package.'], 400);
            }

            $voucher->update([
                'is_used' => true,
                'used_by' => $data['phone_number'],
                'used_at' => now(),
            ]);

            SmsFee::create([
                'admin_id'    => $admin->id,
                'amount'      => -self::SMS_COST,
                'type'        => 'usage',
                'description' => "Voucher Sale: {$voucher->code}",
                'status'      => 'success',
                'created_at'  => now(),
            ]);

            $message    = "Code: {$voucher->code}. Package: {$package->name}.";
            $smsSuccess = $this->sms->send($data['phone_number'], $message, $admin->id);

            return response()->json([
                'message'      => $smsSuccess
                    ? 'Voucher sold and sent via SMS.'
                    : 'Voucher sold, but SMS failed. Share the code manually.',
                'voucher_code' => $voucher->code,
                'sms_sent'     => $smsSuccess,
            ]);
        });
    }

    // Export vouchers as CSV
    public function export(Request $request)
    {
        $request->validate(['package_id' => 'required|exists:packages,id']);

        $vouchers = Voucher::with('package')
            ->where('admin_id', $request->user()->id)
            ->where('package_id', $request->package_id)
            ->where('is_used', false)
            ->get();

        $csv = "Code,Package,Price,Validity Hours,Rate Limit\n";
        foreach ($vouchers as $v) {
            $csv .= "{$v->code},{$v->package->name},{$v->package->price},{$v->package->validity_hours},{$v->package->rate_limit}\n";
        }

        return response($csv, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => 'attachment; filename="vouchers_package_' . $request->package_id . '.csv"',
        ]);
    }

    // ---- FreeRADIUS Helpers ----

    protected function syncToRadius(Voucher $voucher, Package $package): void
    {
        $username  = $voucher->code;
        $groupName = 'pkg_' . $package->id;

        // 1. Set password in radcheck
        RadCheck::updateOrCreate(
            ['username' => $username, 'attribute' => 'Cleartext-Password'],
            ['op' => ':=', 'value' => $username]
        );

        // 2. Assign to package group
        \App\Models\RadUserGroup::updateOrCreate(
            ['username' => $username],
            ['groupname' => $groupName, 'priority' => 1]
        );

        // 3. Set session timeout if applicable
        if ($package->validity_hours > 0) {
            RadReply::updateOrCreate(
                ['username' => $username, 'attribute' => 'Session-Timeout'],
                ['op' => ':=', 'value' => $package->validity_hours * 3600]
            );
        }

        // 4. Set rate limit (MikroTik)
        RadReply::updateOrCreate(
            ['username' => $username, 'attribute' => 'Mikrotik-Rate-Limit'],
            ['op' => '=', 'value' => $package->rate_limit]
        );
    }

    protected function deleteFromRadius(string $code): void
    {
        RadCheck::where('username', $code)->delete();
        RadReply::where('username', $code)->delete();
        \App\Models\RadUserGroup::where('username', $code)->delete();
    }
}
