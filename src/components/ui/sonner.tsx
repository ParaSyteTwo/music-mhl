import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={100}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#0f0f0f] group-[.toaster]:text-[#F5F5F0] group-[.toaster]:border group-[.toaster]:border-[rgba(255,255,255,0.08)] group-[.toaster]:shadow-2xl group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-[#666660]",
          actionButton: "group-[.toast]:bg-[#C8F04B] group-[.toast]:text-[#080808] group-[.toast]:font-semibold group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-[rgba(255,255,255,0.04)] group-[.toast]:text-[#A0A0A0]",
          closeButton: "group-[.toast]:bg-[rgba(255,255,255,0.04)] group-[.toast]:text-[#A0A0A0]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
