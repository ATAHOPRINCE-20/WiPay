# WiPay Monthly Cleanup Script (Mikhmon-Aware)
# Removes users with "Monthly" profile if their expiration date in comment has passed

:local dateint do={
    :local montharray ("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec")
    :local days [:pick $d 4 6]
    :local month [:pick $d 0 3]
    :local year [:pick $d 7 11]
    :local monthint ([:find $montharray $month])
    :local month ($monthint + 1)
    :if ([:len $month] = 1) do={
        :local zero ("0")
        :return [:tonum ("$year$zero$month$days")]
    } else={
        :return [:tonum ("$year$month$days")]
    }
}

:local timeint do={
    :local hours [:pick $t 0 2]
    :local minutes [:pick $t 3 5]
    :return ($hours * 60 + $minutes)
}

:local date [/system clock get date]
:local time [/system clock get time]
:local today [$dateint d=$date]
:local curtime [$timeint t=$time]

:foreach i in=[/ip hotspot user find where profile="Monthly"] do={
    :local usrName [/ip hotspot user get $i name]
    :local usrComment [/ip hotspot user get $i comment]
    
    :local slashPos [:find $usrComment "/"]
    :if ($slashPos >= 3) do={
        :local dateStart ($slashPos - 3)
        :if ([:pick $usrComment ($slashPos + 3)] = "/") do={
            :local datePart [:pick $usrComment $dateStart ($dateStart + 11)]
            :local timePart [:pick $usrComment ($dateStart + 12) ($dateStart + 20)]
            
            :local expd [$dateint d=$datePart]
            :local expt [$timeint t=$timePart]
            
            :if (($expd < $today) or ($expd = $today and $expt < $curtime)) do={
                :log info "WiPay Cleanup: Removing expired Monthly user $usrName"
                [/ip hotspot user remove $i]
                [/ip hotspot active remove [find where user=$usrName]]
            }
        }
    }
}
