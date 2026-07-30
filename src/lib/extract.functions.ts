import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const Input = z.object({
  base64: z.string().min(1),
  mediaType: z.string().min(1),
  kind: z.enum(["image", "pdf"]),
});

const PROMPT = `You are extracting patient billing information from a hospital face sheet. Return ONLY a JSON object with these exact keys (use empty string "" if a field is not present, do not guess):

{
  "firstName": "", "lastName": "", "dob": "", "sex": "", "phone": "", "mrn": "",
  "address": "", "address2": "", "city": "", "state": "", "zip": "",
  "admissionDate": "", "dischargeDate": "", "admissionType": "", "facilityName": "",
  "attendingPhysician": "", "primaryDiagnosis": "", "icd10": "",
  "insuranceName": "", "memberId": "", "groupNumber": "", "priorAuthNumber": "",
  "subscriberName": "",
  "secondaryInsuranceName": "", "secondaryInsuranceId": "",
  "guarantorName": "", "guarantorRelationship": "",
  "handwrittenNotes": ""
}

Format dates as MM/DD/YYYY. For "sex" use M or F. For "address" use only the street line (e.g., 123 Main St Apt 4), with city, state, and ZIP in their own fields. For "admissionType" use the value as printed (e.g., Emergency, Elective, Urgent, Observation). For "handwrittenNotes", transcribe any handwritten or marked-up text on the sheet (e.g., codes a physician wrote by hand, circled items, margin notes) exactly as written; if the handwriting is unclear, transcribe your best reading and add " (unclear)". Leave it "" if there is no handwriting. Return JSON only, no markdown, no commentary.`;

export const extractFaceSheet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3.6-flash");

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            data.kind === "image"
              ? { type: "image", image: bytes, mediaType: data.mediaType }
              : { type: "file", data: bytes, mediaType: data.mediaType },
          ],
        },
      ],
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return JSON.");
    return JSON.parse(match[0]) as Record<string, string>;
  });
