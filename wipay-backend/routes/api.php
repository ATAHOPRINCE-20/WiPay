<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\PackageController;
use App\Http\Controllers\API\VoucherController;
use App\Http\Controllers\API\TransactionController;
use App\Http\Controllers\API\ReportController;
use App\Http\Controllers\API\SmsController;
use App\Http\Controllers\API\SubscriptionController;

// -------------------------------------------------------
// PUBLIC ROUTES (No authentication required)
// -------------------------------------------------------
Route::prefix('public')->group(function () {
    // Captive portal package listing
    Route::get('/packages', [PackageController::class, 'publicList']);

    // Branding info per admin (used by captive portal)
    Route::get('/branding', function (\Illuminate\Http\Request $req) {
        $admin = \App\Models\Admin::find($req->query('admin_id'));
        if (!$admin) return response()->json(['name' => 'WiPay', 'phone' => '']);
        return response()->json(['name' => $admin->business_name, 'phone' => $admin->business_phone]);
    });

    // Initiate purchase from captive portal
    Route::post('/purchase', [TransactionController::class, 'initiatePurchase']);

    // Status polling from captive portal
    Route::post('/check-payment-status', [TransactionController::class, 'checkStatus']);
});

// -------------------------------------------------------
// WEBHOOKS (No authentication - called by Relworx)
// -------------------------------------------------------
Route::post('/webhook/relworx', [TransactionController::class, 'webhook']);

// -------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------
Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,1');

// -------------------------------------------------------
// AUTHENTICATED ADMIN ROUTES
// -------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::prefix('auth')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/profile', [AuthController::class, 'profile']);
        Route::put('/profile', [AuthController::class, 'updateProfile']);
        Route::post('/change-password', [AuthController::class, 'changePassword']);
    });

    // Packages
    Route::apiResource('packages', PackageController::class);

    // Categories
    Route::apiResource('categories', \App\Http\Controllers\API\CategoryController::class);

    // Vouchers
    Route::prefix('vouchers')->group(function () {
        Route::get('/', [VoucherController::class, 'index']);
        Route::post('/generate', [VoucherController::class, 'generate']);
        Route::post('/sell', [VoucherController::class, 'sell']);
        Route::post('/bulk-delete', [VoucherController::class, 'bulkDelete']);
        Route::get('/export', [VoucherController::class, 'export']);
        Route::delete('/{id}', [VoucherController::class, 'destroy']);
    });

    // Transactions
    Route::get('/transactions', [TransactionController::class, 'index']);

    // Reports / Dashboard
    Route::prefix('reports')->group(function () {
        Route::get('/stats', [ReportController::class, 'stats']);
        Route::get('/payments-chart', [ReportController::class, 'paymentsChart']);
        Route::get('/active-users-chart', [ReportController::class, 'activeUsersChart']);
        Route::get('/top-packages', [ReportController::class, 'topPackages']);
    });

    // Routers
    Route::get('/routers/sessions', [\App\Http\Controllers\API\RouterController::class, 'activeSessions']);
    Route::apiResource('routers', \App\Http\Controllers\API\RouterController::class);

    // SMS wallet & logs
    Route::prefix('sms')->group(function () {
        Route::get('/balance', [SmsController::class, 'balance']);
        Route::get('/logs', [SmsController::class, 'logs']);
        Route::post('/buy', [SmsController::class, 'buy']);
        Route::get('/status/{reference}', [SmsController::class, 'status']);
    });

    // Subscription renewal
    Route::prefix('subscription')->group(function () {
        Route::post('/renew', [SubscriptionController::class, 'renew']);
        Route::get('/status/{reference}', [SubscriptionController::class, 'status']);
    });
});
