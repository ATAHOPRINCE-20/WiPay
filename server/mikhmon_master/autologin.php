<?php
/**
 * Mikhmon Auto-Login Bridge (Safe & Resilient Version)
 */

ini_set('display_errors', 0);
error_reporting(E_ALL);

function log_debug($msg) {
    if (empty($msg)) return;
    $timestamp = date("Y-m-d H:i:s");
    $log_file = __DIR__ . "/autologin_debug.log";
    @file_put_contents($log_file, "[$timestamp] $msg\n", FILE_APPEND);
}

// 1. Set Session Path
$session_path = __DIR__ . "/include/tmp";
if (!is_dir($session_path)) @mkdir($session_path, 0777, true);
@session_save_path($session_path);
@session_start();

$token = $_GET['token'] ?? '';
$session_id = $_GET['session'] ?? '';

if (empty($token)) {
    die("Error: Token required.");
}

// 2. Load WiPay .env using ROBUST parser (No parse_ini_file!)
$env_path = "/var/www/wipay-server/.env";
if (!file_exists($env_path)) $env_path = "../../../wipay-server/.env";

if (file_exists($env_path)) {
    $env = [];
    $lines = file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0 || strpos(trim($line), ';') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($name, $value) = explode('=', $line, 2);
            $env[trim($name)] = trim($value, " \t\n\r\0\x0B\"'");
        }
    }
    
    $db_host = $env['DB_HOST'] ?? '127.0.0.1';
    $db_user = $env['DB_USER'] ?? '';
    $db_pass = $env['DB_PASSWORD'] ?? '';
    $db_name = $env['DB_NAME'] ?? '';

    // 3. Connect & Verify
    try {
        $conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
        if (!$conn->connect_error) {
            $stmt = $conn->prepare("SELECT admin_id FROM mikhmon_tokens WHERE token = ? AND expires_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 1");
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $_SESSION['mikhmon'] = "admin";
                $_SESSION['timezone'] = "Africa/Nairobi"; 
                // Cleanup
                $del = $conn->prepare("DELETE FROM mikhmon_tokens WHERE token = ?");
                $del->bind_param("s", $token);
                $del->execute();
            } else {
                die("Error: Invalid or expired session token.");
            }
        }
    } catch (Exception $e) {
        log_debug("DB Error: " . $e->getMessage());
    }
}

// 4. Safe Redirection Logic
if (isset($_SESSION['mikhmon'])) {
    $clean_session = preg_replace('/[^a-zA-Z0-9_\-]/', '', $session_id);
    
    // Check if router exists in config.php to prevent 500 crash in index.php
    $config_file = __DIR__ . "/include/config.php";
    if (file_exists($config_file)) {
        @include($config_file);
    }

    if ($clean_session && isset($data[$clean_session])) {
        $_SESSION[$clean_session] = $clean_session;
        header("Location: index.php?session=" . urlencode($clean_session));
    } else {
        // Router missing - land safe on the router selection page
        header("Location: admin.php?id=sessions");
    }
} else {
    header("Location: admin.php?id=login");
}
exit;
?>
