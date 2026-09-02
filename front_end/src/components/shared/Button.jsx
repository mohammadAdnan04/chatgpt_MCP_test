import Image from "next/image";

const Button = ({
  children,
  className,
  onClick,
  arrow = true,
  variant = "default",
}) => {
  const baseStyles =
    "group cursor-pointer leading-[24px] gap-2.5 flex items-center justify-center";
  const variants = {
    default:
      "rounded-full bg-button px-[38px] py-[15px] font-bold text-white text-base",
    small:
      "rounded-full bg-button px-2.5 py-2 font-normal text-white text-[14px]",
    darkblue:
      "rounded-[12px] bg-[#04145C] px-[38px] py-[15px] font-bold text-white text-base",
    smalldarkblue:
      "w-fit px-2.5 py-2 text-xs font-medium text-white bg-[#04145C] rounded-xl cursor-pointer hover:bg-[#052074] transition-colors duration-200",
    // Add a new variant that doesn't have a background color
    custom: "rounded-full px-[38px] py-[15px] font-bold text-base",
    disabled:
      "rounded-full px-2.5 py-2 font-normal text-white text-[14px]",
    secondary:
    "rounded-[12px] border border-[#d1d5dc] px-2.5 py-2 font-normal text-[#364153] text-[14px]",
  };

  const variantStyles = variants[variant] || variants.default;

  return (
    <button
      className={`${baseStyles} ${variantStyles} ${className}`}
      onClick={onClick}
    >
      {children}
      {arrow && (
        <Image
          src="/icons/arrowRight.svg"
          alt="Arrow Right"
          width={16}
          height={16}
          className="group-hover:translate-x-2 transition-all duration-500 group-active:translate-x-5"
        />
      )}
    </button>
  );
};

export default Button;