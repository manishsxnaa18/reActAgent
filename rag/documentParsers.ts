/**
 * Document Parsers for RAG System
 * Supports: TXT, CSV, Excel (XLSX), PDF, Images (JPEG, JPG, PNG)
 */

import * as fs from "fs";
import * as path from "path";
import { ChatOpenAI } from "@langchain/openai";

export interface DocumentChunk {
  content: string;
  metadata: {
    source: string;
    chunkIndex: number;
    totalChunks: number;
    fileType: string;
    timestamp: string;
    [key: string]: any;
  };
}

/**
 * Parse plain text files
 */
export async function parseTxtFile(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, "utf-8");
  return content;
}

/**
 * Parse CSV files
 * Returns formatted text representation with better structure for semantic search
 */
export async function parseCsvFile(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim());
  
  if (lines.length === 0) return "";
  
  // Parse headers
  const headers = lines[0].split(",").map(h => h.trim());
  const totalRecords = lines.length - 1; // Exclude header row
  
  // Create a more searchable format with metadata and key=value pairs
  let output = `CSV Data from ${path.basename(filePath)}\n`;
  output += `METADATA: Total Records=${totalRecords}, Headers=${headers.join(", ")}\n`;
  output += `Total number of rows in this CSV: ${totalRecords}\n\n`;
  
  // Add each row with clear key-value pairs for better semantic search
  const rows = lines.slice(1).map((line, idx) => {
    const values = line.split(",").map(v => v.trim());
    const rowData = headers
      .map((header, i) => `${header}=${values[i] || ""}`)
      .join(" | ");
    return `[Row ${idx + 1}] ${rowData}`;
  });
  
  output += rows.join("\n");
  return output;
}

/**
 * Parse Excel files (XLSX)
 * Requires xlsx package
 */
export async function parseExcelFile(filePath: string): Promise<string> {
  try {
    // Dynamic import to avoid dependency issues if not installed
    const XLSX = await import("xlsx");
    
    const workbook = XLSX.readFile(filePath);
    let content = "";
    
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      content += `\n\nSheet: ${sheetName}\n`;
      content += jsonData.map((row: any, idx: number) => {
        if (idx === 0) {
          return `Headers: ${row.join(", ")}`;
        }
        return `Row ${idx}: ${row.join(", ")}`;
      }).join("\n");
    });
    
    return content;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse PDF files
 * Requires pdf-parse package
 */
export async function parsePdfFile(filePath: string): Promise<string> {
  try {
    // Dynamic import to avoid dependency issues if not installed
    const pdfParse = await import('pdf-parse');
    const dataBuffer = await fs.promises.readFile(filePath);
    const data = await pdfParse.default(dataBuffer);
    
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse Image files (JPEG, JPG, PNG)
 * Uses OpenAI Vision API to extract text and describe content
 */
export async function parseImageFile(filePath: string): Promise<string> {
  try {
    // Read image file and convert to base64
    const imageBuffer = await fs.promises.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    
    // Determine MIME type
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    // Use OpenAI Vision API to extract text and describe image
    const visionModel = new ChatOpenAI({
      modelName: "gpt-4o",
      maxTokens: 4096
    });
    
    const response = await visionModel.invoke([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this image and extract ALL text content. Also provide a detailed description of what's shown in the image. Format your response as:

TEXT CONTENT:
[All visible text from the image]

IMAGE DESCRIPTION:
[Detailed description of the image content, objects, scenes, charts, diagrams, etc.]`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ]);
    
    const extractedContent = typeof response.content === 'string' 
      ? response.content 
      : JSON.stringify(response.content);
    
    return `Image: ${path.basename(filePath)}\n\n${extractedContent}`;
  } catch (error) {
    throw new Error(`Failed to parse image file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main parser that routes to appropriate handler based on file extension
 */
export async function parseDocument(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case ".txt":
    case ".md":
      return parseTxtFile(filePath);
    
    case ".csv":
      return parseCsvFile(filePath);
    
    case ".xlsx":
    case ".xls":
      return parseExcelFile(filePath);
    
    case ".pdf":
      return parsePdfFile(filePath);
    
    case ".jpg":
    case ".jpeg":
    case ".png":
      return parseImageFile(filePath);
    
    default:
      // Try to read as text for unknown types
      return parseTxtFile(filePath);
  }
}

/**
 * Split document into chunks for embedding
 * @param text The full document text
 * @param chunkSize Maximum characters per chunk
 * @param overlap Number of characters to overlap between chunks
 */
export function splitIntoChunks(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    
    // Move start forward by chunkSize minus overlap
    start += chunkSize - overlap;
    
    // Prevent infinite loop if overlap >= chunkSize
    if (overlap >= chunkSize) start = end;
  }
  
  return chunks;
}

/**
 * Process a document file into chunks ready for embedding
 */
export async function processDocumentToChunks(
  filePath: string,
  chunkSize: number = 1000,
  overlap: number = 200
): Promise<DocumentChunk[]> {
  const content = await parseDocument(filePath);
  const textChunks = splitIntoChunks(content, chunkSize, overlap);
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  
  return textChunks.map((chunk, index) => ({
    content: chunk,
    metadata: {
      source: fileName,
      chunkIndex: index,
      totalChunks: textChunks.length,
      fileType: ext,
      timestamp: new Date().toISOString()
    }
  }));
}
