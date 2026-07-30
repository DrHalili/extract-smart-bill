// Field order profiles that mirror the tab order of real destination screens
// in billing / practice-management software. Add more profiles here as needed.
export type TargetProfile = {
  id: string;
  label: string;
  hint: string;
  order: string[];
};

export const TARGET_PROFILES: TargetProfile[] = [
  {
    id: "registration-general",
    label: "Registration — General",
    hint: "Name, address, DOB, gender, phone in screen order.",
    order: [
      "lastName",
      "firstName",
      "address",
      "address2",
      "zip",
      "city",
      "state",
      "dob",
      "sex",
      "phone",
    ],
  },
  {
    id: "registration-coverage",
    label: "Registration — Coverage/Case Info",
    hint: "Facility, insurance, member no, ICD-10, hospital dates.",
    order: [
      "facilityName",
      "insuranceName",
      "memberId",
      "subscriberName",
      "guarantorRelationship",
      "icd10",
      "admissionDate",
      "dischargeDate",
    ],
  },
  {
    id: "intake-basic",
    label: "Patient intake (basic)",
    hint: "Just the demographics most billers key first.",
    order: ["firstName", "lastName", "dob", "sex", "address", "city", "state", "zip", "phone"],
  },
];
