<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $admin = Admin::where('username', $request->username)->first();

        if (!$admin || !Hash::check($request->password, $admin->password_hash)) {
            throw ValidationException::withMessages([
                'username' => ['Invalid credentials. Please try again.'],
            ]);
        }

        // Update last active
        $admin->update(['last_active_at' => now()]);

        $token = $admin->createToken('wipay-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'admin' => [
                'id' => $admin->id,
                'username' => $admin->username,
                'email' => $admin->email,
                'role' => $admin->role,
                'business_name' => $admin->business_name,
                'business_phone' => $admin->business_phone,
                'billing_type' => $admin->billing_type,
                'subscription_expiry' => $admin->subscription_expiry,
                'sms_balance' => $admin->sms_balance,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function profile(Request $request)
    {
        $admin = $request->user();
        return response()->json([
            'id' => $admin->id,
            'username' => $admin->username,
            'email' => $admin->email,
            'role' => $admin->role,
            'business_name' => $admin->business_name,
            'business_phone' => $admin->business_phone,
            'billing_type' => $admin->billing_type,
            'subscription_expiry' => $admin->subscription_expiry,
            'sms_balance' => $admin->sms_balance,
        ]);
    }

    public function updateProfile(Request $request)
    {
        $admin = $request->user();

        $data = $request->validate([
            'business_name' => 'sometimes|string|max:255',
            'business_phone' => 'sometimes|string|max:50',
            'email' => 'sometimes|email|unique:admins,email,' . $admin->id,
        ]);

        $admin->update($data);

        return response()->json([
            'message' => 'Profile updated.',
            'id' => $admin->id,
            'username' => $admin->username,
            'email' => $admin->email,
            'role' => $admin->role,
            'business_name' => $admin->business_name,
            'business_phone' => $admin->business_phone,
            'billing_type' => $admin->billing_type,
            'subscription_expiry' => $admin->subscription_expiry,
            'sms_balance' => $admin->sms_balance,
        ]);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:6|confirmed',
        ]);

        $admin = $request->user();

        if (!Hash::check($request->current_password, $admin->password_hash)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $admin->update(['password_hash' => Hash::make($request->new_password)]);

        return response()->json(['message' => 'Password changed successfully.']);
    }
}
