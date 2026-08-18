<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "<h1>PHP Debugger</h1>";

// 1. Test Session Write
$savePath = session_save_path();
echo "<b>Session Save Path:</b> " . ($savePath ? $savePath : "Default (/var/lib/php/sessions)") . "<br>";

if (!is_writable($savePath ? $savePath : '/var/lib/php/sessions')) {
    echo "<h2 style='color:red'>CRITICAL: Session path is NOT writable!</h2>";
    echo "Current User: " . exec('whoami') . "<br>";
} else {
    echo "<h2 style='color:green'>Session path is writable.</h2>";
}

// 2. Test Session Creation
try {
    session_start();
    $_SESSION['test'] = 'MikhmonDebug';
    echo "<b>Session Started:</b> OK <br>";
    echo "<b>Session ID:</b> " . session_id() . "<br>";
} catch (Exception $e) {
    echo "<h2 style='color:red'>Session Error: " . $e->getMessage() . "</h2>";
}

// 3. Test XML Extension
if (extension_loaded('xml')) {
    echo "<b>XML Extension:</b> Loaded (OK)<br>";
} else {
    echo "<h2 style='color:red'>XML Extension: MISSING!</h2>";
}
?>
