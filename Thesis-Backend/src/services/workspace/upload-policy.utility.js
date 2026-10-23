import ExcelJS from "exceljs";
import { HttpError } from "../../common/utilities/access.utility.js";
import { fileType } from "../progress/phase-upload.utility.js";

export async function validateUpload(file, purpose = "document") {
    if (!["document", "manpower"].includes(purpose))
        throw new HttpError(400, "Unknown upload purpose.");
    const name = file.originalname || file.original_name || "";
    const buffer = file.buffer || file.content;
    if (!buffer?.length) throw new HttpError(400, "A non-empty file is required.");
    const limit = purpose === "manpower" ? 15 : 10;
    if (buffer.length > limit * 1024 * 1024)
        throw new HttpError(400, `The file must be ${limit} MB or smaller.`);
    if (purpose === "document") return fileType({ buffer, originalname: name });
    if (!/\.(xlsx|xls)$/i.test(name))
        throw new HttpError(400, "Manpower lists require Excel files (.xlsx or .xls). CSV is not supported.");
    if (/\.xlsx$/i.test(name)) {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            if (!workbook.worksheets.length) throw new Error("No worksheets.");
        } catch {
            throw new HttpError(400, "Choose a valid Excel workbook (.xlsx); renaming a file does not convert it.");
        }
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (!buffer.subarray(0, 8).equals(Buffer.from([208,207,17,224,161,177,26,225])))
        throw new HttpError(400, "Choose a valid XLS file; renaming a file does not convert it.");
    return "application/vnd.ms-excel";
}
