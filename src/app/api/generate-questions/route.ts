import { NextRequest, NextResponse } from 'next/server';

// Interface untuk tipe data request
interface GenerateRequest {
  material: string;
  questionType: 'multiple-choice' | 'essay';
  questionCount: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

// Interface untuk tipe data response
interface QuestionResponse {
  questions: Array<{
    question: string;
    options?: string[]; // untuk pilihan ganda
    correctAnswer?: string; // untuk pilihan ganda, isian, benar/salah
    explanation?: string; // opsional
  }>;
}

/**
 * Fungsi untuk membuat prompt berdasarkan jenis soal
 */
function createPrompt(request: GenerateRequest): string {
  const { material, questionType, questionCount, difficulty = 'medium' } = request;
  
  let prompt = `Berdasarkan materi pembelajaran berikut, buat ${questionCount} soal ${getQuestionTypeLabel(questionType)} dengan tingkat kesulitan ${difficulty}.\n\n`;
  prompt += `Materi:\n${material}\n\n`;
  prompt += `Buat soal dalam format JSON yang valid dengan struktur berikut:\n`;
  
  switch (questionType) {
    case 'multiple-choice':
      prompt += `{
  "questions": [
    {
      "question": "pertanyaan",
      "options": ["opsi A", "opsi B", "opsi C", "opsi D"],
      "correctAnswer": "opsi yang benar",
      "explanation": "penjelasan singkat"
    }
  ]
}`;
      break;
    case 'essay':
      prompt += `{
  "questions": [
    {
      "question": "pertanyaan esai yang memerlukan jawaban panjang",
      "explanation": "petunjuk atau kriteria penilaian"
    }
  ]
}`;
      break;
  }
  
  prompt += `\n\nPastikan output adalah JSON yang valid dan bisa di-parse. Jangan tambahkan teks lain di luar JSON.`;
  
  return prompt;
}

// Note: generator fallback removed — only OpenRouter is used to generate questions.
function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'multiple-choice':
      return 'pilihan ganda';
    case 'essay':
      return 'esai';
    default:
      return 'umum';
  }
}

/**
 * Fungsi untuk membersihkan dan mem-parsing JSON response dari AI
 */
function parseAIResponse(response: string): QuestionResponse {
  try {
    // Coba parse langsung
    return JSON.parse(response);
  } catch (error) {
    // Jika gagal, coba ekstrak JSON dari string
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        throw new Error('Gagal mem-parsing response dari AI');
      }
    }
    throw new Error('Response dari AI tidak mengandung JSON yang valid');
  }
}

/**
 * Main API handler untuk POST request
 */
export async function POST(request: NextRequest) {
  try {
    // Validasi API key - hanya OpenRouter diperbolehkan
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Silahkan Coba Lagi' },
        { status: 500 }
      );
    }

    // Parse request body
    const body: GenerateRequest = await request.json();
    const { material, questionType, questionCount } = body;

    // Validasi input
    if (!material || material.trim().length < 50) {
      return NextResponse.json(
        { error: 'materi terlalu singkat' },
        { status: 400 }
      );
    }

    if (!questionType || !['multiple-choice', 'essay'].includes(questionType)) {
      return NextResponse.json(
        { error: 'Jenis soal tidak valid. Hanya "multiple-choice" dan "essay" yang didukung.' },
        { status: 400 }
      );
    }

    if (!questionCount || questionCount < 1 || questionCount > 10) {
      return NextResponse.json(
        { error: 'Jumlah soal harus antara 1-10' },
        { status: 400 }
      );
    }

    // Buat prompt untuk AI
    const prompt = createPrompt(body);

    console.log('Sending prompt to AI:', prompt.substring(0, 100) + '...');

    // Coba OpenRouter API - satu-satunya provider
    if (process.env.OPENROUTER_API_KEY) {
      try {
        console.log('🚀 Attempting OpenRouter API with model meta-llama/llama-3.2-3b-instruct:free...');
        
        // OpenRouter API call
        const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'AI Generator Soal Ujian',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.2-3b-instruct:free',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        });

        if (!openrouterResponse.ok) {
          const errorData = await openrouterResponse.json();
          throw new Error(`OpenRouter API Error: ${JSON.stringify(errorData)}`);
        }

        const openrouterData = await openrouterResponse.json();
        const response = openrouterData.choices[0].message.content;
        const modelUsed = 'meta-llama/llama-3.2-3b-instruct:free';
        console.log('✅ SUCCESS - Received response from OpenRouter:', response.substring(0, 200) + '...');
        
        // Parse response dari AI
        const parsedResponse = parseAIResponse(response);

        // Return success response dengan AI
        return NextResponse.json({
          success: true,
          data: parsedResponse,
          metadata: {
            model: modelUsed,
            questionType,
            questionCount,
            materialLength: material.length,
            aiPowered: true,
            apiProvider: 'OpenRouter',
            note: 'Generated using OpenRouter API with meta-llama/llama-3.2-3b-instruct:free model'
          }
        });
        
      } catch (openrouterError) {
        console.error('❌ OpenRouter API Error Details:', openrouterError);
        return NextResponse.json(
          { error: 'Silahkan Coba Lagi' },
          { status: 500 }
        );
      }
    }

  } catch (error) {
    console.error('Error in generate-questions API:', error);
    
    // Return error response
    return NextResponse.json(
      { 
        error: 'Silahkan Coba Lagi',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handler untuk GET request (untuk testing)
 */
export async function GET() {
  return NextResponse.json({
    message: 'AI Question Generator API',
    version: '1.0.0',
    endpoints: {
      'POST /api/generate-questions': 'Generate questions from learning material',
    },
    supportedQuestionTypes: [
      'multiple-choice',
      'essay'
    ]
  });
}
