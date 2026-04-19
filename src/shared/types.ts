export type SourceType = "upload" | "capture" | "url";

export type OtpEntry = {
  id: string;
  serviceName: string;
  accountName: string;
  secret: string;
  issuer: string;
  digits: number;
  period: number;
  algorithm: string;
  markerColor: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  sourceType: SourceType;
};
