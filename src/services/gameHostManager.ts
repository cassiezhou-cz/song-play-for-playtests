import { aiHostService } from '../../ai-host/src/services/aiHostService'
import { ttsService, type TTSResponse } from './ttsService'

export interface HostResponse {
  text: string
  audioUrl?: string
  success: boolean
  error?: string
  noResponse?: boolean // Indicates when response was skipped due to limiter
}

interface CharacterInfo {
  name: string
  emoji: string
  personality: string
  voiceId?: string
}

export class GameHostManager {
  private initialized = false
  private currentPersonality = 'riley'
  private isReady = false
  private responseRate = 0.60 // 60% chance to generate response

  constructor() {
    this.isReady = aiHostService.getStatus().ready
    console.log(`🎪 AI Host: Response limiter initialized at ${Math.round(this.responseRate * 100)}%`)
  }

  private getCharacterInfo(characterId: string): CharacterInfo {
    const characters: Record<string, CharacterInfo> = {
      riley: { 
        name: 'Riley', 
        emoji: '🎤', 
        personality: 'energetic',
        voiceId: 'h2dQOVyUfIDqY2whPOMo' // Nayva
      },
      willow: { 
        name: 'Willow', 
        emoji: '🌿', 
        personality: 'wise',
        voiceId: 'yj30vwTGJxSHezdAGsv9' // Jessa
      },
      alex: { 
        name: 'Alex', 
        emoji: '🎧', 
        personality: 'cool',
        voiceId: 'yl2ZDV1MzN4HbQJbMihG' // Alex
      },
      jordan: { 
        name: 'Jordan', 
        emoji: '😄', 
        personality: 'funny',
        voiceId: 'x8xv0H8Ako6Iw3cKXLoC' // Haven
      }
    }
    return characters[characterId] || characters.riley
  }

  private getRandomResponseLength(): 'short' | 'medium' | 'long' {
    const rand = Math.random()
    // 60% short, 40% medium, 0% long
    if (rand < 0.60) return 'short'
    return 'medium' // Everything else is medium (40%), no long responses
  }

  private shouldGenerateResponse(): boolean {
    return Math.random() < this.responseRate
  }

  setResponseRate(rate: number): void {
    this.responseRate = Math.max(0, Math.min(1, rate)) // Clamp between 0 and 1
    console.log(`🎪 AI Host: Response rate set to ${Math.round(this.responseRate * 100)}%`)
  }

  getResponseRate(): number {
    return this.responseRate
  }

  // Debug method to test response limiter
  testResponseLimiter(iterations: number = 10): void {
    console.log(`🎪 AI Host: Testing response limiter with ${iterations} iterations at ${Math.round(this.responseRate * 100)}% rate`)
    let responseCount = 0
    let noResponseCount = 0
    
    for (let i = 0; i < iterations; i++) {
      if (this.shouldGenerateResponse()) {
        responseCount++
        console.log(`  ${i + 1}. ✅ Generate response`)
      } else {
        noResponseCount++
        console.log(`  ${i + 1}. ⏸️ [no response]`)
      }
    }
    
    const actualRate = (responseCount / iterations * 100).toFixed(1)
    console.log(`🎪 AI Host: Results - ${responseCount} responses, ${noResponseCount} no responses (${actualRate}% actual rate vs ${Math.round(this.responseRate * 100)}% expected)`)
  }

  async initialize(personalityId: string = 'riley'): Promise<boolean> {
    try {
      // Handle the "none" case - user doesn't want AI host
      if (personalityId === 'none') {
        console.log('🎪 AI Host: Disabled by user selection')
        this.initialized = false
        return false
      }

      // Get the voice ID for this personality
      const character = this.getCharacterInfo(personalityId)
      
      // Initialize the ai-host service
      const initResult = await aiHostService.initialize({
        gameType: 'songquiz',
        gameMode: 'single',
        personalityId,
        voiceId: character.voiceId,
        defaultResponseLength: 'medium'
      })

      if (!initResult.success) {
        console.error('🎪 AI Host: Initialization failed:', initResult.error)
        this.initialized = false
        return false
      }

      this.currentPersonality = personalityId
      this.isReady = aiHostService.getStatus().ready
      this.initialized = true

      console.log(`🎪 AI Host: Initialized with ${personalityId} personality`)
      return true

    } catch (error) {
      console.error('AI Host: Initialization error:', error)
      this.initialized = false
      return false
    }
  }

  async celebrateCorrectAnswer(
    playerName: string,
    playerScore: number,
    songTitle: string,
    songArtist: string,
    options?: {
      responseLength?: 'short' | 'medium' | 'long'
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: 'Nice job!', success: false, error: 'Host not initialized' }
    }

    // Check response limiter
    if (!this.shouldGenerateResponse()) {
      console.log('🎪 AI Host: Skipping response due to rate limiter')
      return {
        text: '[no response]',
        success: true,
        noResponse: true
      }
    }

    try {
      const responseLength = options?.responseLength || this.getRandomResponseLength()
      
      const request = {
        scenario: `${playerName} correctly guessed "${songTitle}" by ${songArtist} and earned 10 points! Their score is now ${playerScore}.`,
        flowStep: {
          id: 'round_result',
          name: 'Round Result',
          description: 'Player answered correctly',
          settings: {
            isCorrect: true,
            performance: 4,
            streakCount: 1
          }
        },
        players: [{ id: 'player1', name: playerName, score: playerScore }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      return {
        text: response.text,
        audioUrl: response.audioUrl,
        success: response.success,
        error: response.error
      }

    } catch (error: any) {
      console.error('AI Host: Failed to generate correct answer response:', error)
      return {
        text: this.getFallbackResponse('correct_answer', songTitle, songArtist),
        success: false,
        error: error.message
      }
    }
  }

  async handleIncorrectAnswer(
    playerName: string,
    songTitle: string,
    songArtist: string,
    options?: {
      responseLength?: 'short' | 'medium' | 'long'
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: 'Nice try!', success: false, error: 'Host not initialized' }
    }

    // Check response limiter
    if (!this.shouldGenerateResponse()) {
      console.log('🎪 AI Host: Skipping response due to rate limiter')
      return {
        text: '[no response]',
        success: true,
        noResponse: true
      }
    }

    try {
      const responseLength = options?.responseLength || this.getRandomResponseLength()
      
      const request = {
        scenario: `${playerName} guessed incorrectly. The correct answer was "${songTitle}" by ${songArtist}.`,
        flowStep: {
          id: 'round_result',
          name: 'Round Result',
          description: 'Player answered incorrectly',
          settings: {
            isCorrect: false,
            performance: 2
          }
        },
        players: [{ id: 'player1', name: playerName, score: 0 }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      return {
        text: response.text,
        audioUrl: response.audioUrl,
        success: response.success,
        error: response.error
      }

    } catch (error: any) {
      console.error('AI Host: Failed to generate incorrect answer response:', error)
      return {
        text: this.getFallbackResponse('wrong_answer', songTitle, songArtist),
        success: false,
        error: error.message
      }
    }
  }

  async introduceQuestion(
    questionNumber: number,
    totalQuestions: number,
    playlistName: string,
    options?: {
      responseLength?: 'short' | 'medium'
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: "Here's your next song!", success: false, error: 'Host not initialized' }
    }

    // Check response limiter
    if (!this.shouldGenerateResponse()) {
      console.log('🎪 AI Host: Skipping response due to rate limiter')
      return {
        text: '[no response]',
        success: true,
        noResponse: true
      }
    }

    try {
      const responseLength = options?.responseLength || 'short'
      
      const request = {
        scenario: `Question ${questionNumber} of ${totalQuestions} from the ${playlistName} playlist is starting. Build excitement!`,
        flowStep: {
          id: 'question_start',
          name: 'Question Start',
          description: 'Starting a new question'
        },
        players: [{ id: 'player1', name: 'Player', score: 0 }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      return {
        text: response.text,
        audioUrl: response.audioUrl,
        success: response.success,
        error: response.error
      }

    } catch (error: any) {
      console.error('AI Host: Failed to generate question intro:', error)
      return {
        text: this.getFallbackResponse('question_start'),
        success: false,
        error: error.message
      }
    }
  }

  async handleGameEnd(
    finalScore: number,
    totalQuestions: number,
    playlistName: string,
    playerName: string = 'Player',
    options?: {
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: 'Thanks for playing!', success: false, error: 'Host not initialized' }
    }

    // Check response limiter
    if (!this.shouldGenerateResponse()) {
      console.log('🎪 AI Host: Skipping response due to rate limiter')
      return {
        text: '[no response]',
        success: true,
        noResponse: true
      }
    }

    try {
      // Calculate correct answers (assuming 10 points per correct answer)
      const correctAnswers = Math.floor(finalScore / 10)
      
      const request = {
        scenario: `${playerName} finished the ${playlistName} playlist! They got ${correctAnswers} questions correct out of ${totalQuestions} total questions, earning ${finalScore} points. Celebrate their performance!`,
        flowStep: {
          id: 'game_result',
          name: 'Game End',
          description: 'Game completed, final results'
        },
        players: [{ id: 'player1', name: playerName, score: finalScore }],
        responseLength: 'long' as const,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      return {
        text: response.text,
        audioUrl: response.audioUrl,
        success: response.success,
        error: response.error
      }

    } catch (error: any) {
      console.error('AI Host: Failed to generate game end response:', error)
      const correctAnswers = Math.floor(finalScore / 10)
      return {
        text: this.getFallbackGameEndResponse(correctAnswers, totalQuestions, finalScore),
        success: false,
        error: error.message
      }
    }
  }

  private getFallbackResponse(
    gamePhase: string, 
    songTitle?: string, 
    songArtist?: string
  ): string {
    const fallbacks = {
      riley: {
        question_start: "Let's hear this one!",
        correct_answer: "YES! You nailed it!",
        wrong_answer: songTitle && songArtist ? `That was "${songTitle}" by ${songArtist}!` : "Not quite, but keep going!",
        round_end: "Keep it up!",
        game_end: "Amazing game!"
      },
      willow: {
        question_start: "Listen deeply to this melody",
        correct_answer: "Beautifully done!",
        wrong_answer: songTitle && songArtist ? `That was "${songTitle}" by ${songArtist}` : "Every song teaches us something",
        round_end: "You're growing with each song",
        game_end: "What a meaningful journey"
      },
      alex: {
        question_start: "Here's a good track",
        correct_answer: "Nice! Good ear",
        wrong_answer: songTitle && songArtist ? `That was "${songTitle}" by ${songArtist}` : "Keep listening, you'll get it",
        round_end: "Solid round",
        game_end: "Good session!"
      },
      jordan: {
        question_start: "Ready for this one?",
        correct_answer: "BAM! You crushed it!",
        wrong_answer: songTitle && songArtist ? `Oops! That was "${songTitle}" by ${songArtist}` : "So close, yet so far!",
        round_end: "This is getting interesting!",
        game_end: "What a wild ride!"
      }
    }

    const characterFallbacks = fallbacks[this.currentPersonality as keyof typeof fallbacks] || fallbacks.riley
    return characterFallbacks[gamePhase as keyof typeof characterFallbacks] || "Great job playing!"
  }

  getStatus() {
    const hostStatus = aiHostService.getStatus()
    return {
      initialized: this.initialized,
      currentPersonality: this.currentPersonality,
      aiServiceReady: hostStatus.aiProviderReady,
      ttsServiceReady: hostStatus.ttsProviderReady,
      responseRate: this.responseRate
    }
  }

  isServiceReady(): boolean {
    return this.initialized && aiHostService.getStatus().aiProviderReady
  }

  // Alias for backwards compatibility
  isInitialized(): boolean {
    return this.initialized
  }

  async announceGameIntro(
    playlistName: string,
    playerName: string = 'Player',
    options?: {
      responseLength?: 'short' | 'medium'
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: "Welcome to Song Quiz!", success: false, error: 'Host not initialized' }
    }

    // Note: Game intro typically should always play, but respecting the limiter
    if (!this.shouldGenerateResponse()) {
      console.log('🎪 AI Host: Skipping game intro due to rate limiter')
      return {
        text: '[no response]',
        success: true,
        noResponse: true
      }
    }

    try {
      const responseLength = options?.responseLength || 'medium'
      
      const request = {
        scenario: `Welcome ${playerName} to Song Quiz! They're about to play the ${playlistName} playlist. Get them excited to start!`,
        flowStep: {
          id: 'question_start',
          name: 'Game Intro',
          description: 'Starting the game with playlist introduction'
        },
        players: [{ id: 'player1', name: playerName, score: 0 }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      console.log('🔊 AI Host (Intro): Generating response with ai-host service')
      const response = await aiHostService.generateResponse(request)
      
      console.log('🔊 AI Host (Intro): Response received:', { 
        success: response.success, 
        hasText: !!response.text, 
        hasAudio: !!response.audioUrl, 
        text: response.text?.substring(0, 50) + '...' 
      })

      return {
        text: response.text || this.getFallbackGameIntro(playlistName),
        audioUrl: response.audioUrl,
        success: response.success,
        error: response.error
      }

    } catch (error: any) {
      console.error('AI Host: Failed to generate game intro:', error)
      return {
        text: this.getFallbackGameIntro(playlistName),
        success: false,
        error: error.message
      }
    }
  }

  private getFallbackGameIntro(playlistName: string): string {
    const character = this.getCharacterInfo(this.currentPersonality)
    
    const intros = {
      riley: `${character.emoji} Welcome to Song Quiz! Get ready to rock the ${playlistName} playlist! Let's see what you've got!`,
      willow: `${character.emoji} Welcome, music lover. Today we explore the beautiful sounds of the ${playlistName}. Listen with your heart.`,
      alex: `${character.emoji} Hey there! Time for some ${playlistName} vibes. Let's see if you know your music.`,
      jordan: `${character.emoji} Welcome to the show! The ${playlistName} are calling - let's see if you can answer! Get ready for some fun!`
    }

    return intros[this.currentPersonality as keyof typeof intros] || intros.riley
  }

  private getFallbackGameEndResponse(correctAnswers: number, totalQuestions: number, finalScore: number): string {
    const character = this.getCharacterInfo(this.currentPersonality)
    
    const responses = {
      riley: `${character.emoji} Amazing game! You got ${correctAnswers} out of ${totalQuestions} questions correct for ${finalScore} points!`,
      willow: `${character.emoji} What a meaningful journey. ${correctAnswers} correct answers out of ${totalQuestions}, earning you ${finalScore} points.`,
      alex: `${character.emoji} Good session! ${correctAnswers} out of ${totalQuestions} right, ${finalScore} points total.`,
      jordan: `${character.emoji} What a wild ride! ${correctAnswers} correct out of ${totalQuestions} questions - that's ${finalScore} points of pure fun!`
    }

    return responses[this.currentPersonality as keyof typeof responses] || responses.riley
  }
}

// Export singleton instance
export const gameHost = new GameHostManager()

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).gameHost = gameHost
}