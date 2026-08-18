# WiPay Login Watcher (ROS7 Compatible)
# Handles Mikhmon formats like "4w2d", "1w", "1d", "1h", "30m"
# Check for active users every minute and create expiry schedulers.

/system scheduler remove [find name="wipay_login_watcher"]
/system scheduler add name="wipay_login_watcher" interval=1m on-event={
    :foreach session in=[/ip hotspot active find] do={
        :local user [/ip hotspot active get $session user];
        
        # Only proceed if no scheduler already exists for this user
        :if ([/system scheduler find name=$user] = "") do={
            :local usrIdx [/ip hotspot user find name=$user];
            
            :if ([:len $usrIdx] > 0) do={
                :local comment [/ip hotspot user get $usrIdx comment];
                
                # Look for "wipay:" prefix
                :if ([:find $comment "wipay:"] != -1) do={
                    :local rawVal [:pick $comment ([:find $comment "wipay:"] + 6) [:len $comment]];
                    
                    # Clean the string (remove anything after first space or pipe)
                    :local spacePos [:find $rawVal " "];
                    :if ($spacePos > 0) do={ :set rawVal [:pick $rawVal 0 $spacePos] }
                    :local pipePos [:find $rawVal "|"];
                    :if ($pipePos > 0) do={ :set rawVal [:pick $rawVal 0 $pipePos] }
                    
                    :local totalSecs 0;
                    :local buffer "";
                    :local hasValidUnit false;
                    
                    # Manual parsing of "4w2d" or "1d12h" style strings
                    :for i from=0 to=([:len $rawVal] - 1) do={
                        :local char [:pick $rawVal $i ($i + 1)];
                        :if ($char ~ "[0-9]") do={
                            :set buffer ($buffer . $char);
                        } else={
                            :if ($char = "w") do={ :set totalSecs ($totalSecs + ([:tonum $buffer] * 604800)); :set hasValidUnit true }
                            :if ($char = "d") do={ :set totalSecs ($totalSecs + ([:tonum $buffer] * 86400)); :set hasValidUnit true }
                            :if ($char = "h") do={ :set totalSecs ($totalSecs + ([:tonum $buffer] * 3600)); :set hasValidUnit true }
                            :if ($char = "m") do={ :set totalSecs ($totalSecs + ([:tonum $buffer] * 60)); :set hasValidUnit true }
                            :if ($char = "s") do={ :set totalSecs ($totalSecs + [:tonum $buffer]); :set hasValidUnit true }
                            :set buffer "";
                        }
                    }
                    
                    # IGNORE any leftover buffer that doesn't have a unit
                    # This prevents picking up '18' from a date or ID at the end of the string
                    :if ([:len $buffer] > 0) do={
                        :log debug "WiPay: Ignoring unit-less number '$buffer' at end of validity string.";
                    }

                    :if ($totalSecs > 0) do={
                        :local tv [:totime $totalSecs];
                        :log info "WiPay: User $user login parsed $tv from '$rawVal'.";
                        
                        /system scheduler add name=$user interval=$tv on-event="/ip hotspot active remove [find user=\"$user\"]; /ip hotspot user disable [find name=\"$user\"]; /system scheduler remove [find name=\"$user\"]"
                        
                        # Stamp exact login/expiry time for visibility
                        :local date [/system clock get date];
                        :local time [/system clock get time];
                        /ip hotspot user set $usrIdx comment="started:$date $time | validity:$tv";
                    }
                }
            }
        }
    }
}
