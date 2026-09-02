import React from "react";
import Button from "@/components/shared/Button";
import { ChevronDown } from "lucide-react";
import Pagination from "@/components/shared/Pagination";
import DashboardContainer from "@/components/dashboardLayoutContainer";

const TourDataEnrichment = () => {
  return (
    <DashboardContainer heading="Data Enrichment">
      <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
        {/* <p className="text-[#222]">
          API Endpoint used by server: Set by server; check server logs for
          MAWSOOL_API_URL
        </p> */}
        <div className="w-full px-4 py-6 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#222]">
              Input LinkedIn Profile URLs
            </p>
            <div className="w-fit px-3 py-2 text-xs font-medium text-white flex items-center gap-1 bg-[#04145C] rounded-lg cursor-pointer hover:bg-[#052074] transition-colors duration-200">
              <img
                src="/icons/importIcon.svg"
                className="select-none"
                draggable={false}
                alt=""
              />{" "}
              Import Data
            </div>
          </div>
          <textarea
            placeholder={`Enter LinkedIn URLs, one per line...
e.g., https://www.linkedin.com/in/osama-abdelhadi/
https://www.linkedin.com/in/oday-ali-aa0b0428b/
https://www.linkedin.com/in/anas-m-jarrar/`}
            className="input__field h-[150px] inputlinkdingProfileUrls"
          />
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-[#222]">
              Select Data Focus (API Hint)
            </p>
            <div className="w-full flex items-center justify-between input__field !px-3.5 cursor-pointer">
              <p className="text-xs font-medium text-[#434343]">
                Full profile (Default)
              </p>
              <img
                src="/icons/arrowDown.svg"
                className="select-none"
                draggable="false"
                alt=""
              />
            </div>
          </div>
          <Button arrow={false} variant="small" className={"w-fit !rounded-xl"}>
            Enrich Contacts
          </Button>
        </div>
        <div className="dataEnrichmentTable w-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          <div className="w-full flex items-center justify-between">
            <p className="text-sm text-[#222]">Results</p>
            <div className="flex items-center gap-5">
              <div className="w-fit px-3 py-2 text-xs font-medium text-white flex items-center gap-1 bg-[#04145C] rounded-lg cursor-pointer hover:bg-[#052074] transition-colors duration-200">
                <img
                  src="/icons/copyIcon.svg"
                  className="select-none"
                  draggable={false}
                  alt=""
                />{" "}
                Copy CSV
              </div>
              <div className="w-fit px-3 py-2 text-xs font-medium text-white flex items-center gap-1 bg-[#04145C] rounded-lg cursor-pointer hover:bg-[#052074] transition-colors duration-200">
                <img
                  src="/icons/copyIcon.svg"
                  className="select-none"
                  draggable={false}
                  alt=""
                />{" "}
                Copy JSON
              </div>
              <div className="w-[220px] px-4 py-2.5 flex items-center justify-between bg-[#EFF0F0] rounded-full">
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full h-full text-xs text-[#242E2C] placeholder:text-[#242E2C] outline-none border-none bg-transparent"
                />
                <img
                  src="/icons/SearchIcon.svg"
                  className="select-none"
                  draggable={false}
                  alt=""
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-0">
            <div className="w-full px-2.5 py-1.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6]">
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Profile URL</p>
                <Arrow />
              </div>
              <div className="min-w-[50px] max-w-[50px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Photo</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Company</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Location</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Summary</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Emails</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Phones</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Current Job</p>
                <Arrow />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Job History</p>
                <Arrow />
              </div>
            </div>
            <div className="w-full px-2.5 py-3.5 flex items-center justify-between">
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-1.5">
                <Linkedin />
                <p className="text-xs text-[#242E2C] underline">Osama Abdelhadi</p>
              </div>
              <div className="min-w-[50px] max-w-[50px] flex items-center gap-0">
                <img
                  src="/dashboard/dataEnrichment/osama-abdelhadi.jpg"
                  className="rounded-[50px] select-none"
                  alt=""
                  width={32}
                  height={32}
                />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Mawsool International</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Riyadh, Riyadh Province, Saudi Arabia</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">CEO @ Mawsool | 1 Billion Contacts | Building the ...</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">osa*a.**@mawsool.tech</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">+96655*0*4*99</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Co-Founder & CEO</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Co-Founder & CEO @ Mawsool International..</p>
              </div>
            </div>
            <div className="w-full px-2.5 py-3.5 flex items-center justify-between">
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-1.5">
                <Linkedin />
                <p className="text-xs text-[#242E2C] underline">Oday Ali</p>
              </div>
              <div className="min-w-[50px] max-w-[50px] flex items-center gap-0">
                <img
                  src="/dashboard/dataEnrichment/oday-ali.jpg"
                  className="rounded-[50px] select-none"
                  alt=""
                  width={32}
                  height={32}
                />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Mawsool International</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Amman, Amman Governorate, Jordan</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Co-Founder and CTO</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">o**y@mawsool.tech</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">+9627*59*0**9, +9712**5*5**53</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Co-Founder and CTO</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Co-Founder and CTO @ Mawsool International...</p>
              </div>
            </div>
            <div className="w-full px-2.5 py-3.5 flex items-center justify-between">
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-1.5">
                <Linkedin />
                <p className="text-xs text-[#242E2C] underline">Anas Jarrar</p>
              </div>
              <div className="min-w-[50px] max-w-[50px] flex items-center gap-0">
                <img
                  src="/dashboard/dataEnrichment/anas-jarrar.jpg"
                  className="rounded-[50px] select-none"
                  alt=""
                  width={32}
                  height={32}
                />
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Mawsool International</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Riyadh, Riyadh Province, Saudi Arabia</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Serial Entrepreneur | Venture Builder</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">jarr***ana**1@gmail.com</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">+962**800*4*5</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Strategic Advisor</p>
              </div>
              <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                <p className="text-xs text-[#242E2C]">Strategic Advisor @ PowerMatch (2024-10 –...</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-[#434343] leading-[130%]">
                Showing
              </span>
              <div className="flex cursor-pointer items-center rounded-[7px] gap-1 px-1.5 py-1.5 pl-2 text-xs text-[#717171] font-medium bg-[#E9E9E9]">
                12
                <ChevronDown size={16} />
              </div>
              <span className="text-xs text-[#434343] leading-[130%]">
                out of 512
              </span>
            </div>
            <Pagination className="!p-0" />
          </div>
        </div>
      </div>
    </DashboardContainer>
  );
};

export default TourDataEnrichment;

const Arrow = ({}) => {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.85983 6.85983C4.00628 6.71339 4.24372 6.71339 4.39017 6.85983L6 8.46967L7.60984 6.85983C7.75628 6.71339 7.99372 6.71339 8.14016 6.85983C8.28661 7.00628 8.28661 7.24372 8.14016 7.39017L6.26516 9.26516C6.11872 9.41161 5.88128 9.41161 5.73484 9.26516L3.85983 7.39017C3.71339 7.24372 3.71339 7.00628 3.85983 6.85983Z"
          fill="#242E2C"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.85983 5.14017C4.00628 5.28661 4.24372 5.28661 4.39017 5.14017L6 3.53033L7.60984 5.14017C7.75628 5.28661 7.99372 5.28661 8.14016 5.14017C8.28661 4.99372 8.28661 4.75628 8.14016 4.60983L6.26516 2.73484C6.11872 2.58839 5.88128 2.58839 5.73484 2.73484L3.85983 4.60983C3.71339 4.75628 3.71339 4.99372 3.85983 5.14017Z"
          fill="#242E2C"
        />
      </svg>
    </>
  );
};


const Linkedin = ({}) => {
  return (
    <>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13.8182 0H2.18182C0.976833 0 0 0.976833 0 2.18182V13.8182C0 15.0232 0.976833 16 2.18182 16H13.8182C15.0232 16 16 15.0232 16 13.8182V2.18182C16 0.976833 15.0232 0 13.8182 0Z"
          fill="#0A66C2"
        />
        <path
          d="M5.76341 4.36364C5.76341 4.63334 5.68343 4.89698 5.53359 5.12123C5.38375 5.34548 5.17078 5.52026 4.92161 5.62347C4.67244 5.72668 4.39826 5.75369 4.13374 5.70107C3.86922 5.64845 3.62624 5.51858 3.43553 5.32787C3.24483 5.13717 3.11495 4.89419 3.06234 4.62967C3.00972 4.36515 3.03672 4.09097 3.13993 3.8418C3.24314 3.59262 3.41793 3.37965 3.64217 3.22981C3.86642 3.07998 4.13007 3 4.39977 3C4.76143 3 5.10828 3.14367 5.36401 3.3994C5.61974 3.65513 5.76341 4.00198 5.76341 4.36364ZM5.45432 6.63636V12.6609C5.45456 12.7054 5.44601 12.7494 5.42917 12.7905C5.41232 12.8317 5.38752 12.8691 5.35618 12.9006C5.32483 12.9321 5.28757 12.9571 5.24653 12.9742C5.20549 12.9912 5.16149 13 5.11704 13H3.67977C3.63533 13.0001 3.5913 12.9915 3.55021 12.9745C3.50913 12.9575 3.4718 12.9326 3.44037 12.9012C3.40894 12.8698 3.38404 12.8325 3.36709 12.7914C3.35013 12.7503 3.34147 12.7063 3.34159 12.6618V6.63636C3.34159 6.54667 3.37722 6.46065 3.44064 6.39723C3.50406 6.33381 3.59008 6.29818 3.67977 6.29818H5.11704C5.20658 6.29842 5.29236 6.33416 5.35559 6.39755C5.41881 6.46095 5.45432 6.54683 5.45432 6.63636ZM12.967 9.77273V12.6891C12.9672 12.73 12.9592 12.7704 12.9436 12.8082C12.928 12.846 12.9051 12.8803 12.8762 12.9092C12.8474 12.9381 12.813 12.961 12.7753 12.9766C12.7375 12.9922 12.697 13.0001 12.6561 13H11.1107C11.0698 13.0001 11.0293 12.9922 10.9916 12.9766C10.9538 12.961 10.9195 12.9381 10.8906 12.9092C10.8617 12.8803 10.8388 12.846 10.8232 12.8082C10.8076 12.7704 10.7997 12.73 10.7998 12.6891V9.86273C10.7998 9.44091 10.9234 8.01545 9.69704 8.01545C8.74704 8.01545 8.55341 8.99091 8.51522 9.42909V12.6891C8.51523 12.7708 8.4831 12.8492 8.42577 12.9073C8.36845 12.9655 8.29053 12.9988 8.20886 13H6.71613C6.67535 13 6.63496 12.992 6.59729 12.9763C6.55962 12.9607 6.52541 12.9378 6.49661 12.9089C6.46781 12.88 6.44499 12.8457 6.42947 12.808C6.41394 12.7703 6.40601 12.7299 6.40613 12.6891V6.61C6.40601 6.56921 6.41394 6.52881 6.42947 6.49109C6.44499 6.45337 6.46781 6.41909 6.49661 6.39021C6.52541 6.36133 6.55962 6.33841 6.59729 6.32277C6.63496 6.30714 6.67535 6.29909 6.71613 6.29909H8.20886C8.29132 6.29909 8.3704 6.33185 8.42871 6.39015C8.48701 6.44846 8.51977 6.52754 8.51977 6.61V7.13545C8.8725 6.60636 9.39522 6.19818 10.5107 6.19818C12.9816 6.19818 12.967 8.50545 12.967 9.77273Z"
          fill="white"
        />
      </svg>
    </>
  );
};
