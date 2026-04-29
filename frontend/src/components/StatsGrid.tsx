type Stat = {
  title: string;
  value: string;
  subtitle?: string;
  color: string;
  icon: React.ReactNode;
};

const stats: Stat[] = [
  {
    title: "GitHub Stars",
    value: "11.2K",
    color: "text-yellow-600 bg-yellow-500/10",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    )
  },
  {
    title: "Downloads",
    value: "1.9M",
    subtitle: "last month",
    color: "text-blue-600 bg-blue-500/10",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
    )
  },
  {
    title: "Forks",
    value: "533",
    color: "text-purple-600 bg-purple-500/10",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
      </svg>
    )
  },
  {
    title: "Contributors",
    value: "218",
    color: "text-green-600 bg-green-500/10",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7"/>
      </svg>
    )
  }
];

export default function StatsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {stat.title}
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </p>
              {stat.subtitle && (
                <p className="mt-1 text-xs text-gray-500">
                  {stat.subtitle}
                </p>
              )}
            </div>

            <div className={`p-3 rounded-lg ${stat.color}`}>
              {stat.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}