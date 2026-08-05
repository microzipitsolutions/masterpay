// Shared full-page shell for auth screens (Login/Signup). Page background
// stays pure white per MasterPay brand guidelines — the color story comes
// from soft blurred brand-color accents, not a dark/colored page background.
export default function AuthShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white flex items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-brand-blue/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand-teal/10 blur-3xl" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
