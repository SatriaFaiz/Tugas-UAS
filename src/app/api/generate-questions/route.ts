import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inisialisasi Google Gemini API dengan API key dari environment variables
const genAI = process.env.GOOGLE_GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY) : null;

// Interface untuk tipe data request
interface GenerateRequest {
  material: string;
  questionType: 'multiple-choice' | 'fill-blank' | 'true-false' | 'essay';
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
      
    case 'fill-blank':
      prompt += `{
  "questions": [
    {
      "question": "pertanyaan dengan bagian kosong ___",
      "correctAnswer": "jawaban yang tepat",
      "explanation": "penjelasan singkat"
    }
  ]
}`;
      break;
      
    case 'true-false':
      prompt += `{
  "questions": [
    {
      "question": "pernyataan yang harus dinilai benar/salah",
      "correctAnswer": "benar" atau "salah",
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

/**
 * Fallback function untuk generate soal tanpa AI (template-based yang lebih baik)
 */
function generateFallbackQuestions(request: GenerateRequest): NextResponse {
  const { material, questionType, questionCount } = request;
  const questions = [];

  // Extract keywords yang lebih relevan dengan context
  const extractRelevantKeywords = (text: string) => {
    // Kata-kata penting dalam konteks akademis
    const stopWords = ['a','an','yang','dan','di','dari','untuk','dengan','pada','adalah','merupakan','memiliki','dapat','akan','oleh','sebagai','dalam','ini','tersebut','karena','seperti','yaitu','atau','jika','namun','tetapi','melainkan','selain','itu','juga','sudah','belum','akan','telah','sedang','masih','lagi','antara','kepada','terhadap','tentang','mengenai','mengapa','bagaimana','berapa','kapan','dimana','siapa','apa'];
    
    // Filter kata-kata penting (panjang > 3 dan bukan stop words)
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const filtered = words.filter(word => !stopWords.includes(word));
    
    // Ambil kata-kata unik yang paling relevan
    return [...new Set(filtered)].slice(0, 8);
  };

  // Extract konsep utama dari kalimat pertama
  const getMainConcept = (text: string) => {
    const sentences = text.split(/[.!?]+/);
    if (sentences.length > 0) {
      const firstSentence = sentences[0].trim();
      const words = firstSentence.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      return words[0] || 'konsep';
    }
    return 'konsep';
  };

  const keywords = extractRelevantKeywords(material);
  const mainConcept = getMainConcept(material);

  // Generate soal yang lebih kontekstual
  for (let i = 0; i < questionCount; i++) {
    const keyword = keywords[i] || mainConcept;
    
    switch (questionType) {
      case 'multiple-choice':
        // Buat soal pilihan ganda yang lebih relevan
        questions.push({
          question: `Berdasarkan materi yang diberikan, manakah pernyataan yang paling tepat mengenai ${keyword}?`,
          options: [
            `${keyword} merupakan konsep penting dalam materi pembelajaran ini`,
            `${keyword} tidak memiliki hubungan dengan topik yang dibahas`,
            `${keyword} hanya berlaku untuk kondisi tertentu saja`,
            `${keyword} dapat diabaikan dalam pemahaman materi`
          ],
          correctAnswer: `${keyword} merupakan konsep penting dalam materi pembelajaran ini`,
          explanation: `Berdasarkan materi pembelajaran yang diberikan, ${keyword} adalah konsep yang relevan dan penting untuk dipahami.`
        });
        break;
        
      case 'fill-blank':
        questions.push({
          question: `Dalam konteks materi ini, ${keyword} berperan penting sebagai ___ untuk mencapai pemahaman yang lebih baik.`,
          correctAnswer: 'kunci konsep',
          explanation: `${keyword} merupakan kunci konsep yang membantu dalam memahami keseluruhan materi pembelajaran.`
        });
        break;
        
      case 'true-false':
        questions.push({
          question: `Berdasarkan materi pembelajaran, ${keyword} merupakan elemen penting yang perlu dipahami.`,
          correctAnswer: 'benar',
          explanation: `Pernyataan ini benar karena ${keyword} secara eksplisit atau implisit dibahas dalam materi pembelajaran sebagai konsep penting.`
        });
        break;
        
      case 'essay':
        questions.push({
          question: `Jelaskan signifikansi ${keyword} dalam konteks materi pembelajaran ini! Analisis mengapa konsep ini penting dan berikan contoh aplikasi nyata.`,
          explanation: `Jawaban esai yang baik harus menjelaskan definisi ${keyword}, pentingnya dalam konteks materi, dan memberikan contoh konkret yang relevan.`
        });
        break;
    }
  }

  return NextResponse.json({
    success: true,
    data: { questions },
    metadata: {
      model: 'improved-fallback-template',
      questionType,
      questionCount,
      materialLength: material.length,
      keywords: keywords,
      mainConcept: mainConcept,
      note: 'Generated using improved template-based fallback with better context awareness'
    }
  });
}
function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'multiple-choice':
      return 'pilihan ganda';
    case 'fill-blank':
      return 'isian singkat';
    case 'true-false':
      return 'benar/salah';
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
    // Validasi API key - prioritaskan OpenRouter
    if (!process.env.OPENROUTER_API_KEY && !process.env.GOOGLE_GEMINI_API_KEY && !process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json(
        { error: 'Tidak ada API key yang dikonfigurasi (OpenRouter, Gemini, atau Hugging Face)' },
        { status: 500 }
      );
    }

    // Parse request body
    const body: GenerateRequest = await request.json();
    const { material, questionType, questionCount } = body;

    // Validasi input
    if (!material || material.trim().length < 50) {
      return NextResponse.json(
        { error: 'Materi pembelajaran harus diisi minimal 50 karakter' },
        { status: 400 }
      );
    }

    if (!questionType || !['multiple-choice', 'fill-blank', 'true-false', 'essay'].includes(questionType)) {
      return NextResponse.json(
        { error: 'Jenis soal tidak valid' },
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

    let response;
    let modelUsed = '';

    // Coba OpenRouter API dulu - PRIORITAS UTAMA
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
        response = openrouterData.choices[0].message.content;
        modelUsed = 'meta-llama/llama-3.2-3b-instruct:free';
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
        console.log('🔄 OpenRouter failed, trying Google Gemini...');
        
        // Fallback ke Google Gemini
        if (genAI) {
          try {
            console.log('🚀 Attempting Gemini Direct API Call...');
            
            const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: prompt
                  }]
                }],
                generationConfig: {
                  temperature: 0.7,
                  topP: 0.8,
                  topK: 40,
                  maxOutputTokens: 1000,
                }
              })
            });

            if (!geminiResponse.ok) {
              const errorData = await geminiResponse.json();
              throw new Error(`Gemini API Error: ${JSON.stringify(errorData)}`);
            }

            const geminiData = await geminiResponse.json();
            response = geminiData.candidates[0].content.parts[0].text;
            modelUsed = 'gemini-pro-direct';
            console.log('✅ SUCCESS - Received response from Gemini Direct:', response.substring(0, 200) + '...');
            
            const parsedResponse = parseAIResponse(response);
            return NextResponse.json({
              success: true,
              data: parsedResponse,
              metadata: {
                model: modelUsed,
                questionType,
                questionCount,
                materialLength: material.length,
                aiPowered: true,
                apiProvider: 'Google Gemini (Fallback)',
                note: 'Generated using Google Gemini AI API (OpenRouter fallback)'
              }
            });
            
          } catch (geminiError) {
            console.error('❌ Gemini API Error:', geminiError);
            console.log('🔄 All AI APIs failed, using fallback template...');
            return generateFallbackQuestions(body);
          }
        } else {
          console.log('🔄 No Gemini API key, using fallback template...');
          return generateFallbackQuestions(body);
        }
      }
    } else {
      console.log('❌ No OpenRouter API key found, using fallback...');
      return generateFallbackQuestions(body);
    }

  } catch (error) {
    console.error('Error in generate-questions API:', error);
    
    // Return error response
    return NextResponse.json(
      { 
        error: 'Gagal menghasilkan soal. Silakan coba lagi.',
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
      'fill-blank', 
      'true-false',
      'essay'
    ]
  });
}
