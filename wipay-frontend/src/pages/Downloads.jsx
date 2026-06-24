import { Download, FileText, Router, ShieldAlert, Cpu, Wrench } from 'lucide-react'

export default function Downloads() {
  const items = [
    {
      title: 'Winbox Utility',
      description: 'The official MikroTik application to manage and configure your RouterOS router graphically.',
      version: 'v3.40 (Latest)',
      type: 'Utility',
      link: 'https://mikrotik.com/download',
      icon: Cpu,
      color: 'bg-primary-50 text-primary-600 border-primary-100'
    },
    {
      title: 'MikroTik Hotspot Configuration Script',
      description: 'Default baseline configuration script to setup interfaces, DHCP servers, DNS, and hotspot rules.',
      version: 'v1.2',
      type: 'Configuration',
      link: '/routers', // directs back to Routers configuration page to copy the script
      icon: Router,
      color: 'bg-green-50 text-green-600 border-green-100',
      actionLabel: 'Go to Routers'
    },
    {
      title: 'WiPay Installation Manual',
      description: 'Step-by-step PDF manual detailing how to configure the WireGuard VPN connection, DNS, and RADIUS settings on MikroTik.',
      version: 'V2.0 (PDF)',
      type: 'Documentation',
      link: 'https://ugpay.tech/documentation.pdf', // placeholder or static link
      icon: FileText,
      color: 'bg-yellow-50 text-yellow-600 border-yellow-100'
    },
    {
      title: 'MikroTik default firewall rules',
      description: 'Optimized firewall config script for safeguarding your MikroTik router against brute-force attacks and DNS abuse.',
      version: 'v1.0 (RSC)',
      type: 'Security Script',
      link: '#',
      icon: ShieldAlert,
      color: 'bg-red-50 text-red-600 border-red-100',
      isDownload: true
    }
  ]

  const handleDownload = (item) => {
    if (item.link === '#') {
      // Simulate file download for script
      const scriptText = `# MikroTik Baseline Security & Firewall Config
/ip firewall filter
add action=accept chain=input comment="def: accept established,related,untracked" connection-state=established,related,untracked
add action=drop chain=input comment="def: drop invalid" connection-state=invalid
add action=accept chain=input comment="def: accept ICMP" protocol=icmp
add action=drop chain=input comment="def: drop all not coming from LAN" in-interface-list=!LAN
`
      const blob = new Blob([scriptText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'baseline_firewall.rsc'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      window.open(item.link, '_blank')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Downloads Center</h2>
        <p className="text-sm text-gray-400">Download administrative tools, scripts, default configurations, and user guides</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item, idx) => {
          const Icon = item.icon
          return (
            <div key={idx} className="card p-6 flex flex-col justify-between hover:shadow-lg transition-all duration-300">
              <div className="flex gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${item.color.split(' ')[0]} ${item.color.split(' ')[2]} flex-shrink-0`}>
                  <Icon className={`w-6 h-6 ${item.color.split(' ')[1]}`} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{item.type}</span>
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{item.version}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed pt-1">{item.description}</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-50 flex justify-end">
                <button 
                  onClick={() => handleDownload(item)}
                  className="btn-secondary text-xs flex items-center gap-1.5 px-4 py-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{item.actionLabel || 'Download'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
