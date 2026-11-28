import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={{ top: "calc(var(--sat, 0px) + 60px)" }}
      mobileOffset={{ top: "calc(var(--sat, 0px) + 14px)", left: 12, right: 12 }}
      visibleToasts={3}
      closeButton
      richColors
      className="toaster group"
      style={{ zIndex: 9999 }}
      toastOptions={{
        classNames: {
          toast:
            "group toast max-w-[calc(100vw-24px)] group-[.toaster]:bg-[#141417]/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-[#F5F5F0] group-[.toaster]:border group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_16px_40px_rgba(0,0,0,0.75)] group-[.toaster]:rounded-2xl group-[.toaster]:py-3 group-[.toaster]:px-4 group-[.toaster]:text-sm group-[.toaster]:font-medium",
          description: "group-[.toast]:text-[#9E9E98] group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-[var(--accent-primary)] group-[.toast]:text-[#080808] group-[.toast]:font-semibold group-[.toast]:rounded-xl group-[.toast]:px-3 group-[.toast]:py-1.5",
          cancelButton: "group-[.toast]:bg-white/[0.08] group-[.toast]:text-[#C8C8C0] group-[.toast]:rounded-xl",
          closeButton: "group-[.toast]:bg-white/[0.08] group-[.toast]:text-[#C8C8C0] group-[.toast]:border-white/10 group-[.toast]:hover:bg-white/[0.15]",
          success: "group-[.toaster]:border-[var(--accent-primary)]/45 group-[.toaster]:text-[#F5F5F0]",
          error: "group-[.toaster]:border-rose-500/45 group-[.toaster]:text-[#F5F5F0]",
          info: "group-[.toaster]:border-sky-500/45 group-[.toaster]:text-[#F5F5F0]",
          warning: "group-[.toaster]:border-amber-500/45 group-[.toaster]:text-[#F5F5F0]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

