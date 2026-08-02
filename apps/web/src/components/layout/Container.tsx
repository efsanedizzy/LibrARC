import type { ReactNode } from "react";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export function Container({ children, className = "" }: ContainerProps) {
  return (
    <div
      className={["mx-auto w-full max-w-[90rem] px-5 sm:px-6 lg:px-8 xl:px-10", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
