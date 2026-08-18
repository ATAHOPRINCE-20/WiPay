import React from 'react'

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse-none">
      {/* Metric Cards - 4 Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-24 h-4 shimmer-box" />
              <div className="w-8 h-8 rounded-lg shimmer-box" />
            </div>
            <div className="w-36 h-7 shimmer-box" />
            <div className="w-48 h-3 shimmer-box" />
          </div>
        ))}
      </div>

      {/* Charts Row - 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payments Chart Skeleton */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="w-28 h-5 shimmer-box" />
              <div className="w-40 h-3 shimmer-box" />
            </div>
            <div className="w-24 h-7 rounded-lg shimmer-box" />
          </div>
          {/* Chart Bars Skeleton */}
          <div className="h-[220px] flex items-end justify-between gap-3 pt-6 px-2">
            {[40, 65, 30, 85, 50, 90, 75, 45, 60, 80, 55, 95].map((h, idx) => (
              <div key={idx} className="w-full flex flex-col items-center gap-2">
                <div 
                  className="w-full shimmer-box rounded-t-md" 
                  style={{ height: `${h}%` }} 
                />
                <div className="w-6 h-3 shimmer-box" />
              </div>
            ))}
          </div>
        </div>

        {/* Active Users Chart Skeleton */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="w-32 h-5 shimmer-box" />
              <div className="w-52 h-3 shimmer-box" />
            </div>
            <div className="w-24 h-7 rounded-lg shimmer-box" />
          </div>
          {/* Line Chart Skeleton Waves */}
          <div className="h-[220px] flex flex-col justify-between py-2 px-2">
            {[1, 2, 3, 4, 5].map((line) => (
              <div key={line} className="w-full h-[1px] bg-gray-100 relative">
                <div className="w-full h-full shimmer-box" />
              </div>
            ))}
            <div className="h-28 w-full rounded-xl shimmer-box mt-2" />
          </div>
          <div className="flex items-center gap-4 pt-1">
            <div className="w-32 h-4 shimmer-box" />
            <div className="w-32 h-4 shimmer-box" />
          </div>
        </div>
      </div>

      {/* Summary Cards Row - 4 Columns */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="w-16 h-3 shimmer-box" />
            <div className="w-24 h-6 shimmer-box" />
          </div>
        ))}
      </div>
    </div>
  )
}
