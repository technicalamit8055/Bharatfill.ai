import { z } from "zod";

/** Every on-screen line, editable from the Studio props panel. */
export const promoSchema = z.object({
  problemLead: z.string(),
  problemMiddle: z.string(),
  problemRepeat: z.string(),
  tagline: z.string(),
  scannerTitle: z.string(),
  scannerSubtitle: z.string(),
  badgeName: z.string(),
  badgeDob: z.string(),
  badgeId: z.string(),
  autofillTitle: z.string(),
  autofillButton: z.string(),
  statOneValue: z.number().int().min(1).max(999),
  statOneSuffix: z.string(),
  statOneLabel: z.string(),
  statTwoBig: z.string(),
  statTwoLabel: z.string(),
  cta: z.string(),
});

export type PromoProps = z.infer<typeof promoSchema>;

export const defaultPromoProps: PromoProps = {
  problemLead: "Tired of typing",
  problemMiddle: "the same government forms",
  problemRepeat: "again and again?",
  tagline: "India's Smartest AI Form Filling & Document Automation",
  scannerTitle: "AI Document Scanner",
  scannerSubtitle: "Aadhaar · PAN · Marksheets · Certificates",
  badgeName: "Name Extracted",
  badgeDob: "DOB Verified",
  badgeId: "ID No. Masked",
  autofillTitle: "1-Click Browser Auto-Fill",
  autofillButton: "Auto-Fill with Bharatfill",
  statOneValue: 10,
  statOneSuffix: "x",
  statOneLabel: "Faster",
  statTwoBig: "Zero",
  statTwoLabel: "Rejections",
  cta: "Automate Your Forms at Bharatfill.ai",
};

/** Copy for the "auto-resize & upload documents" promo. */
export const docsPromoSchema = z.object({
  hookLineOne: z.string(),
  hookLineTwo: z.string(),
  rejectedStamp: z.string(),
  resizeTitle: z.string(),
  uploadTitle: z.string(),
  attachLabel: z.string(),
  endTagline: z.string(),
  cta: z.string(),
});

export type DocsPromoProps = z.infer<typeof docsPromoSchema>;

export const defaultDocsPromoProps: DocsPromoProps = {
  hookLineOne: "Photo too big?",
  hookLineTwo: "Signature the wrong size?",
  rejectedStamp: "REJECTED",
  resizeTitle: "Auto-Resize Every Document",
  uploadTitle: "Auto-Upload into the Form",
  attachLabel: "Attach fitted copy",
  endTagline: "Photo, signature and PDF — resized to the portal's rules.",
  cta: "Resize & Upload at Bharatfill.ai",
};
