import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Import libraries untuk text extraction
let pdfParse: any;
let mammoth: any;

// Dynamic imports untuk menghindari error saat build
async function loadLibraries() {
  if (!pdfParse) {
    try {
      const pdfModule = await import('pdf-parse');
      // @ts-ignore - pdf-parse module has different export structure
      pdfParse = pdfModule.default || pdfModule;
    } catch (error) {
      console.error('Failed to load pdf-parse:', error);
      pdfParse = null;
    }
  }
  if (!mammoth) {
    try {
      const mammothModule = await import('mammoth');
      mammoth = mammothModule.default || mammothModule;
    } catch (error) {
      console.error('Failed to load mammoth:', error);
      mammoth = null;
    }
  }
}

/**
 * Interface untuk response
 */
interface ExtractTextResponse {
  success: boolean;
  text?: string;
  filename?: string;
  fileType?: string;
  error?: string;
}

/**
 * Fungsi untuk ekstrak teks dari PDF
 */
async function extractFromPDF(buffer: Buffer): Promise<string> {
  await loadLibraries();
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Fungsi untuk ekstrak teks dari DOCX
 */
async function extractFromDOCX(buffer: Buffer): Promise<string> {
  await loadLibraries();
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Fungsi untuk ekstrak teks dari file text biasa
 */
function extractFromText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

/**
 * Validasi file type
 */
function isValidFileType(filename: string, mimeType: string): boolean {
  const validExtensions = ['.pdf', '.docx', '.txt'];
  const validMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return validExtensions.includes(extension) && validMimeTypes.includes(mimeType);
}

/**
 * Main handler untuk POST request
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // Validasi file
    if (!file) {
      return NextResponse.json<ExtractTextResponse>({
        success: false,
        error: 'Tidak ada file yang diupload'
      }, { status: 400 });
    }

    // Validasi file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json<ExtractTextResponse>({
        success: false,
        error: 'Ukuran file maksimal 10MB'
      }, { status: 400 });
    }

    // Validasi file type
    if (!isValidFileType(file.name, file.type)) {
      return NextResponse.json<ExtractTextResponse>({
        success: false,
        error: 'Tipe file tidak didukung. Gunakan PDF, DOCX, atau TXT'
      }, { status: 400 });
    }

    // Buat buffer dari file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ekstrak teks berdasarkan tipe file
    let extractedText = '';
    const fileType = file.name.toLowerCase().substring(file.name.lastIndexOf('.') + 1);

    try {
      switch (fileType) {
        case 'pdf':
          extractedText = await extractFromPDF(buffer);
          break;
        case 'docx':
          extractedText = await extractFromDOCX(buffer);
          break;
        case 'txt':
          extractedText = extractFromText(buffer);
          break;
        default:
          throw new Error('Tipe file tidak didukung');
      }

      // Validasi hasil ekstraksi
      if (!extractedText || extractedText.trim().length < 10) {
        return NextResponse.json<ExtractTextResponse>({
          success: false,
          error: 'Tidak dapat mengekstrak teks dari file. Pastikan file mengandung teks yang dapat dibaca.'
        }, { status: 400 });
      }

      // Optional: Save file ke disk (untuk debugging)
      // const uploadsDir = join(process.cwd(), 'uploads');
      // if (!existsSync(uploadsDir)) {
      //   await mkdir(uploadsDir, { recursive: true });
      // }
      // await writeFile(join(uploadsDir, file.name), buffer);

      // Return success response
      return NextResponse.json<ExtractTextResponse>({
        success: true,
        text: extractedText,
        filename: file.name,
        fileType: fileType.toUpperCase()
      });

    } catch (extractError) {
      console.error('Error extracting text:', extractError);
      return NextResponse.json<ExtractTextResponse>({
        success: false,
        error: `Gagal mengekstrak teks dari ${fileType.toUpperCase()}: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in extract-text API:', error);
    return NextResponse.json<ExtractTextResponse>({
      success: false,
      error: 'Terjadi kesalahan saat memproses file. Silakan coba lagi.'
    }, { status: 500 });
  }
}

/**
 * Handler untuk GET request (untuk testing)
 */
export async function GET() {
  return NextResponse.json({
    message: 'Text Extraction API',
    version: '1.0.0',
    endpoints: {
      'POST /api/extract-text': 'Extract text from uploaded file',
    },
    supportedFormats: ['PDF', 'DOCX', 'TXT'],
    maxFileSize: '10MB'
  });
}
