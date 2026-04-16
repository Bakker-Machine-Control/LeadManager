export default function StatusBadge({ status }) {
  const styles = {
    synced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    error: 'bg-red-100 text-red-700 border-red-200',
    'Open': 'bg-blue-100 text-blue-700 border-blue-200',
    'Held': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Not Held': 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const labels = {
    synced: 'Synced',
    pending: 'Pending',
    error: 'Error',
  };
  const cls = styles[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[status] || status}
    </span>
  );
}