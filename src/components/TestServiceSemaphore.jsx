const TEST_SERVICE_LABELS = [
  { key: "testResult", label: "PLIS-RESULT" },
  { key: "daqsys", label: "DAQSYS" },
  { key: "ecmfan", label: "ECMFAN (Torque)" },
];

function TestServiceSemaphore({ serviceStatuses }) {
  if (!serviceStatuses) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {TEST_SERVICE_LABELS.map(({ key, label }) => {
        const status = serviceStatuses[key];
        const isOk = status === 1;
        const isUnknown = status === null || status === undefined;
        const dotColor = isUnknown
          ? "bg-gray-300"
          : isOk
          ? "bg-green-500"
          : "bg-red-500";
        const textColor = isUnknown
          ? "text-gray-500"
          : isOk
          ? "text-green-700"
          : "text-red-600";
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium ${textColor}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></span>
            {label}
          </span>
        );
      })}
    </div>
  );
}

export default TestServiceSemaphore;
