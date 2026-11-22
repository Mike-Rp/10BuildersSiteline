export const PH_MOBILE_PREFIX = "+639";
export const PH_MOBILE_ERROR = "Enter a Philippine mobile number in the format +63 9XX XXX XXXX.";

export function isPhilippineMobile(value) {
    return typeof value === "string" && /^(?:\+639|09)[0-9]{9}$/.test(value);
}
