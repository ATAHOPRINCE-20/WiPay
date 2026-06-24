<?php
// Simple MikroTik API Test Script
// Run on VPS: php test_api.php

$ip = "10.66.66.2";
$user = "apiuser";
$pass = "123456";
$port = 8728;

echo "--- MikroTik API Connectivity Test ---\n";
echo "Target: $ip:$port\n";
echo "User: $user\n";

// 1. Test TCP Connection
echo "\nStep 1: Testing TCP Socket... ";
$fp = @fsockopen($ip, $port, $errno, $errstr, 5);
if (!$fp) {
    echo "FAILED!\n";
    echo "Error $errno: $errstr\n";
    exit(1);
} else {
    echo "SUCCESS!\n";
}

// 2. Test Login Handshake
echo "Step 2: Testing Login Handshake... ";

function word($word) {
    $len = strlen($word);
    $packet = "";
    if ($len < 0x80) {
        $packet .= chr($len);
    } elseif ($len < 0x4000) {
        $packet .= chr(($len >> 8) | 0x80) . chr($len & 0xFF);
    }
    $packet .= $word;
    return $packet;
}

function read($fp) {
    $lenByte = ord(fread($fp, 1));
    if ($lenByte & 0x80) {
        $lenByte &= 0x7f;
        $lenByte = ($lenByte << 8) | ord(fread($fp, 1));
    }
    return fread($fp, $lenByte);
}

// Send Login Command
fwrite($fp, word("/login"));
fwrite($fp, chr(0)); // End of sentence

// Read Challenge
$response = [];
while (true) {
    $line = read($fp);
    if ($line === "") break; // End of response
    if ($line === "!done") break;
    if ($line === "!trap") {
        echo "TRAP Received (Should not happen yet)\n";
        break;
    }
    if (strpos($line, "=ret=") !== false) {
        $challenge = substr($line, 5);
    }
}

if (!isset($challenge)) {
    echo "FAILED! No challenge received.\n";
    exit(1);
}
echo "Challenge Received: " . bin2hex($challenge) . "\n";

// 3. Send Hashed Password
echo "Step 3: Sending Credentials... ";

$hash = md5(chr(0) . $pass . pack('H*', $challenge));
fwrite($fp, word("/login"));
fwrite($fp, word("=name=" . $user));
fwrite($fp, word("=response=00" . $hash));
fwrite($fp, chr(0));

// Read Result
$loggedIn = false;
while (true) {
    $line = read($fp);
    if ($line === "") break; 
    if ($line === "!done") {
        $loggedIn = true;
        break;
    }
    if ($line === "!trap") {
        echo "FAILED: Login Rejected (Check User/Pass)\n";
        exit(1);
    }
}

if ($loggedIn) {
    echo "SUCCESS! Authentication Confirmed.\n";
} else {
    echo "FAILED: Unknown response.\n";
}

fclose($fp);
echo "\n--- Test Complete ---\n";
?>
