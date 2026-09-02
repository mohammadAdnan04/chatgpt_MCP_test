import React from "react";

const StepEleven = () => {
  return (
    <textarea
      placeholder={`Enter LinkedIn URLs, one per line...
e.g., https://www.linkedin.com/in/osama-abdelhadi/
https://www.linkedin.com/in/oday-ali-aa0b0428b/
https://www.linkedin.com/in/anas-m-jarrar/`}
      className="input__field h-[150px] w-[calc(100%-300px)] right-[48px] top-[160px] !border-4 !border-[#C7F5FF] fixed"
      disabled
    />
  );
};

export default StepEleven;
