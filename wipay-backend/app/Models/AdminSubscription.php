<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AdminSubscription extends Model
{
    protected $fillable = [
        'admin_id',
        'amount',
        'months',
        'phone_number',
        'status',
        'reference',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function admin()
    {
        return $this->belongsTo(Admin::class, 'admin_id');
    }
}
