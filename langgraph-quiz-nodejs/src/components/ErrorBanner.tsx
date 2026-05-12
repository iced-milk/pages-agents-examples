import { AlertIcon, XIcon } from "./icons";

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-md border border-red-200 bg-red-50 text-red-900 text-sm animate-fade-in"
      role="alert"
    >
      <AlertIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed break-all">{message}</div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-red-600 hover:text-red-800 cursor-pointer p-0.5 -m-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
        aria-label="dismiss"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
