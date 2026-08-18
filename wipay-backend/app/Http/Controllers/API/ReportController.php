<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Models\Voucher;
use App\Models\RadAcct;
use App\Models\Package;
use App\Models\Category;
use App\Models\Router;
use App\Models\SmsFee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    // Main dashboard stats
    public function stats(Request $request)
    {
        $adminId = $request->user()->id;
        $now     = now();

        $revenue = Transaction::where('admin_id', $adminId)
            ->where('status', 'success')
            ->selectRaw("
                SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END) AS this_week,
                SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END) AS this_month,
                SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END) AS this_year,
                COUNT(*) AS total_transactions
            ", [
                $now->copy()->startOfDay(),
                $now->copy()->startOfWeek(),
                $now->copy()->startOfMonth(),
                $now->copy()->startOfYear(),
            ])
            ->first();

        $totalVouchers  = Voucher::where('admin_id', $adminId)->count();
        $usedVouchers   = Voucher::where('admin_id', $adminId)->where('is_used', true)->count();
        $unusedVouchers = $totalVouchers - $usedVouchers;

        $adminRouterIPs = Router::where('admin_id', $adminId)->pluck('ip_address');
        $activeSessions = RadAcct::whereNull('acctstoptime')
            ->whereIn('nasipaddress', $adminRouterIPs)
            ->count();

        $activeSessionDetails = RadAcct::whereNull('acctstoptime')
            ->whereIn('nasipaddress', $adminRouterIPs)
            ->select('username', 'acctsessiontime')
            ->get();

        $remainingHours = collect($activeSessionDetails)->map(function ($session) {
            $voucher = Voucher::where('code', $session->username)->first();
            if (!$voucher || !$voucher->package) {
                return 0;
            }

            $package = $voucher->package;
            $validitySeconds = 0;

            if ($package->validity_unit === 'minutes' && $package->validity_minutes) {
                $validitySeconds = (int) $package->validity_minutes * 60;
            } elseif ($package->validity_unit === 'hours' && $package->validity_hours) {
                $validitySeconds = (int) $package->validity_hours * 3600;
            } elseif ($package->validity_hours) {
                $validitySeconds = (int) $package->validity_hours * 3600;
            } elseif ($package->validity_minutes) {
                $validitySeconds = (int) $package->validity_minutes * 60;
            }

            $usedSeconds = (int) ($session->acctsessiontime ?? 0);
            $remainingSeconds = max(0, $validitySeconds - $usedSeconds);

            return round($remainingSeconds / 3600, 2);
        })->toArray();

        $smsBalance = max(0, (float) SmsFee::where('admin_id', $adminId)
            ->where(fn ($q) => $q->where('status', 'success')->orWhereNull('status'))
            ->sum('amount'));

        return response()->json([
            'revenue'         => $revenue,
            'vouchers'        => [
                'total'   => $totalVouchers,
                'used'    => $usedVouchers,
                'unused'  => $unusedVouchers,
            ],
            'active_sessions' => $activeSessions,
            'remaining_hours' => $remainingHours,
            'sms_balance'     => $smsBalance,
            'counts'          => [
                'packages'      => Package::where('admin_id', $adminId)->count(),
                'vouchers'      => Voucher::where('admin_id', $adminId)->where('is_used', false)->count(),
                'routers'       => Router::where('admin_id', $adminId)->count(),
                'categories'    => Category::where('admin_id', $adminId)->count(),
                'transactions'  => Transaction::where('admin_id', $adminId)->count(),
                'active_users'  => $activeSessions,
                'clients'       => $usedVouchers,
            ],
        ]);
    }

    // Monthly payments chart data
    public function paymentsChart(Request $request)
    {
        $adminId = $request->user()->id;
        $year    = $request->input('year', now()->year);

        $query = Transaction::where('admin_id', $adminId)
            ->where('status', 'success')
            ->whereYear('created_at', $year);

        if (DB::connection()->getDriverName() === 'pgsql') {
            $data = $query
                ->selectRaw("TO_CHAR(created_at, 'Mon') AS month, EXTRACT(MONTH FROM created_at) AS month_num, SUM(amount) AS total")
                ->groupByRaw('month, month_num')
                ->orderBy('month_num')
                ->get();
        } else {
            $data = $query
                ->selectRaw("strftime('%b', created_at) AS month, CAST(strftime('%m', created_at) AS INTEGER) AS month_num, SUM(amount) AS total")
                ->groupByRaw("strftime('%m', created_at), strftime('%b', created_at)")
                ->orderBy('month_num')
                ->get();
        }

        return response()->json($data);
    }

    // Active Users chart (from radacct sessions per day)
    public function activeUsersChart(Request $request)
    {
        $days = $request->input('days', 7);

        $data = RadAcct::whereNull('acctstoptime')
            ->orWhere('acctstoptime', '>=', now()->subDays($days))
            ->selectRaw("DATE(acctstarttime) AS date, COUNT(DISTINCT username) AS users")
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json($data);
    }

    // Top packages by revenue
    public function topPackages(Request $request)
    {
        $adminId = $request->user()->id;

        $data = Transaction::where('admin_id', $adminId)
            ->where('status', 'success')
            ->with('package:id,name')
            ->selectRaw("package_id, SUM(amount) AS total_revenue, COUNT(*) AS total_sales")
            ->groupBy('package_id')
            ->orderByDesc('total_revenue')
            ->limit(5)
            ->get();

        return response()->json($data);
    }
}
