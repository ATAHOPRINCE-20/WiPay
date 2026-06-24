<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('admins')->onDelete('cascade');
            $table->decimal('amount', 10, 2);
            $table->unsignedTinyInteger('months');
            $table->string('phone_number', 50);
            $table->enum('status', ['pending', 'success', 'failed'])->default('pending');
            $table->string('reference', 100)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_subscriptions');
    }
};
