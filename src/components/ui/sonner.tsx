import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={24}
      richColors
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#141417]/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-[#F5F5F0] group-[.toaster]:border group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_16px_40px_rgba(0,0,0,0.7)] group-[.toaster]:rounded-2xl group-[.toaster]:py-3 group-[.toaster]:px-4 group-[.toaster]:text-sm group-[.toaster]:font-medium",
          description: "group-[.toast]:text-[#9E9E98] group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-[#C8F04B] group-[.toast]:text-[#080808] group-[.toast]:font-semibold group-[.toast]:rounded-xl group-[.toast]:px-3 group-[.toast]:py-1.5",
          cancelButton: "group-[.toast]:bg-white/[0.08] group-[.toast]:text-[#C8C8C0] group-[.toast]:rounded-xl",
          closeButton: "group-[.toast]:bg-white/[0.08] group-[.toast]:text-[#C8C8C0] group-[.toast]:hover:bg-white/[0.15]",
          success: "group-[.toaster]:border-[#C8F04B]/40 group-[.toaster]:text-[#F5F5F0]",
          error: "group-[.toaster]:border-rose-500/40 group-[.toaster]:text-[#F5F5F0]",
          info: "group-[.toaster]:border-sky-500/40 group-[.toaster]:text-[#F5F5F0]",
          warning: "group-[.toaster]:border-amber-500/40 group-[.toaster]:text-[#F5F5F0]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

