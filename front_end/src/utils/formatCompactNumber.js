export const formatCompactNumber = (number) => {
  const num = Number(number);
  if (isNaN(num)) return "0";
  
  if (num < 1000) return num.toString();

  if (num >= 1000000) {
    return `${Math.ceil(num / 1000000)}M`;
  }
  
  if (num >= 1000) {
    return `${Math.ceil(num / 1000)}K`;
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num);
};
