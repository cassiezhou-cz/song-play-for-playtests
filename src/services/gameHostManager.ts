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

interface RoundData {
  roundNumber: number
  songTitle: string
  songArtist: string
  playerGuess: string
  isCorrect: boolean
  pointsEarned: number
  playerScore: number
  opponentScore: number
  aiResponse?: string
  timestamp: number
}

interface GameContext {
  gameId: string
  playlistName: string
  playerName: string
  totalQuestions: number
  currentRound: number
  
  // Current game stats
  correctCount: number
  incorrectCount: number
  currentStreak: number
  longestStreak: number
  playerScore: number
  opponentScore: number
  
  // Historical data (last 5 rounds)
  recentRounds: RoundData[]
  
  // Previous AI responses to avoid repetition
  recentAIResponses: string[]
}

export class GameHostManager {
  private initialized = false
  private currentPersonality = 'riley'
  private isReady = false
  private responseRate = 0.75 // 75% chance to generate response
  private gameContext: GameContext | null = null

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

  // Game context management methods
  startNewGame(playlistName: string, playerName: string, totalQuestions: number): void {
    this.gameContext = {
      gameId: `game_${Date.now()}`,
      playlistName,
      playerName,
      totalQuestions,
      currentRound: 0,
      correctCount: 0,
      incorrectCount: 0,
      currentStreak: 0,
      longestStreak: 0,
      playerScore: 0,
      opponentScore: 0,
      recentRounds: [],
      recentAIResponses: []
    }
    console.log(`🎪 AI Host: Started new game context for ${playerName} - ${playlistName}`)
  }

  addRoundResult(
    songTitle: string,
    songArtist: string,
    playerGuess: string,
    isCorrect: boolean,
    pointsEarned: number,
    playerScore: number,
    opponentScore: number = 0
  ): void {
    if (!this.gameContext) {
      console.warn('🎪 AI Host: No game context available for round result')
      return
    }

    this.gameContext.currentRound++
    
    // Update stats
    if (isCorrect) {
      this.gameContext.correctCount++
      this.gameContext.currentStreak++
      this.gameContext.longestStreak = Math.max(this.gameContext.longestStreak, this.gameContext.currentStreak)
    } else {
      this.gameContext.incorrectCount++
      this.gameContext.currentStreak = 0
    }
    
    this.gameContext.playerScore = playerScore
    this.gameContext.opponentScore = opponentScore

    // Add round data
    const roundData: RoundData = {
      roundNumber: this.gameContext.currentRound,
      songTitle,
      songArtist,
      playerGuess,
      isCorrect,
      pointsEarned,
      playerScore,
      opponentScore,
      timestamp: Date.now()
    }

    this.gameContext.recentRounds.push(roundData)
    
    // Keep only last 5 rounds
    if (this.gameContext.recentRounds.length > 5) {
      this.gameContext.recentRounds.shift()
    }

    console.log(`🎪 AI Host: Added round ${this.gameContext.currentRound}: ${isCorrect ? '✅' : '❌'} ${songTitle} by ${songArtist}`)
  }

  addAIResponse(response: string): void {
    if (!this.gameContext || !response || response === '[no response]') {
      return
    }

    this.gameContext.recentAIResponses.push(response)
    
    // Keep only last 5 responses
    if (this.gameContext.recentAIResponses.length > 5) {
      this.gameContext.recentAIResponses.shift()
    }
  }

  getGameContext(): GameContext | null {
    return this.gameContext
  }

  private buildRichScenario(
    baseScenario: string,
    songTitle: string,
    songArtist: string,
    playerGuess: string,
    isCorrect: boolean
  ): string {
    if (!this.gameContext) {
      return baseScenario
    }

    const ctx = this.gameContext
    const scoreDelta = ctx.playerScore - ctx.opponentScore

    // Build comprehensive context
    let richScenario = baseScenario + '\n\nADDITIONAL CONTEXT:\n'

    // Game progress
    richScenario += `- Game Progress: Round ${ctx.currentRound}/${ctx.totalQuestions} of ${ctx.playlistName} playlist\n`
    richScenario += `- Overall Performance: ${ctx.correctCount} correct, ${ctx.incorrectCount} incorrect this game\n`

    // Scoring context
    richScenario += `- Current Scores: ${ctx.playerName} ${ctx.playerScore}, Opponent ${ctx.opponentScore}`
    if (scoreDelta > 0) {
      richScenario += ` (${ctx.playerName} leading by ${scoreDelta})\n`
    } else if (scoreDelta < 0) {
      richScenario += ` (${ctx.playerName} trailing by ${Math.abs(scoreDelta)})\n`
    } else {
      richScenario += ` (tied game)\n`
    }

    // Streak information
    if (ctx.currentStreak > 1) {
      richScenario += `- Current Streak: ${ctx.currentStreak} correct in a row!\n`
    }
    if (ctx.longestStreak > 2) {
      richScenario += `- Best Streak: ${ctx.longestStreak} correct answers\n`
    }

    // Player's actual speech input
    if (playerGuess && playerGuess.trim() !== '') {
      richScenario += `- Player's Exact Words: "${playerGuess}"\n`
    }

    // Recent game history (last 5 rounds)
    if (ctx.recentRounds.length > 0) {
      richScenario += '- Recent Rounds:\n'
      ctx.recentRounds.forEach((round, index) => {
        const status = round.isCorrect ? '✅' : '❌'
        richScenario += `  ${round.roundNumber}. ${status} "${round.songTitle}" by ${round.songArtist}`
        if (round.playerGuess) {
          richScenario += ` (guessed: "${round.playerGuess}")`
        }
        richScenario += '\n'
      })
    }

    // Recent AI responses to avoid repetition
    if (ctx.recentAIResponses.length > 0) {
      richScenario += '- Recent AI Responses (AVOID REPEATING THESE):\n'
      ctx.recentAIResponses.forEach((response, index) => {
        richScenario += `  "${response}"\n`
      })
    }

    richScenario += '\nMake your response unique and contextually relevant to this specific game moment!'

    return richScenario
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
    playerGuess: string = '',
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
      
      // Build rich context-aware scenario
      const baseScenario = `${playerName} correctly guessed "${songTitle}" by ${songArtist} and earned 10 points! Their score is now ${playerScore}.`
      const richScenario = this.buildRichScenario(baseScenario, songTitle, songArtist, playerGuess, true)
      
      const request = {
        scenario: richScenario,
        flowStep: {
          id: 'round_result',
          name: 'Round Result',
          description: 'Player answered correctly',
          settings: {
            isCorrect: true,
            performance: 4,
            streakCount: this.gameContext?.currentStreak || 1
          }
        },
        players: [{ id: 'player1', name: playerName, score: playerScore }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      // Track the AI response to avoid repetition
      if (response.success && response.text) {
        this.addAIResponse(response.text)
      }

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
    playerGuess: string = '',
    playerScore: number = 0,
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
      
      // Build rich context-aware scenario
      const baseScenario = `${playerName} guessed incorrectly. The correct answer was "${songTitle}" by ${songArtist}.`
      const richScenario = this.buildRichScenario(baseScenario, songTitle, songArtist, playerGuess, false)
      
      const request = {
        scenario: richScenario,
        flowStep: {
          id: 'round_result',
          name: 'Round Result',
          description: 'Player answered incorrectly',
          settings: {
            isCorrect: false,
            performance: 2
          }
        },
        players: [{ id: 'player1', name: playerName, score: playerScore }],
        responseLength,
        generateVoice: options?.generateVoice ?? true
      }

      const response = await aiHostService.generateResponse(request)
      
      // Track the AI response to avoid repetition
      if (response.success && response.text) {
        this.addAIResponse(response.text)
      }

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

    // Game end should ALWAYS play - skip rate limiter
    console.log('🎪 AI Host: Game end bypassing rate limiter (always play)')

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
    totalQuestions: number = 5,
    options?: {
      responseLength?: 'short' | 'medium'
      generateVoice?: boolean
    }
  ): Promise<HostResponse> {
    if (!this.initialized) {
      return { text: "Welcome to Song Quiz!", success: false, error: 'Host not initialized' }
    }

    // Initialize new game context
    this.startNewGame(playlistName, playerName, totalQuestions)

    // Game intro should ALWAYS play - skip rate limiter
    console.log('🎪 AI Host: Game intro bypassing rate limiter (always play)')

    try {
      const responseLength = options?.responseLength || 'medium'
      
      const request = {
        scenario: `Welcome ${playerName} to Song Quiz! They're about to play the ${playlistName} playlist with ${totalQuestions} questions. Get them excited to start!`,
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
      
      // Track the AI response to avoid repetition
      if (response.success && response.text) {
        this.addAIResponse(response.text)
      }
      
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

  // Simple wrapper for easy integration with existing components
  async handleAnswer(
    playerName: string,
    songTitle: string,
    songArtist: string,
    playerGuess: string,
    isCorrect: boolean,
    pointsEarned: number,
    playerScore: number,
    opponentScore: number = 0
  ): Promise<HostResponse> {
    // Add to context tracking
    this.addRoundResult(songTitle, songArtist, playerGuess, isCorrect, pointsEarned, playerScore, opponentScore)
    
    // Generate appropriate response
    if (isCorrect) {
      return this.celebrateCorrectAnswer(playerName, playerScore, songTitle, songArtist, playerGuess)
    } else {
      return this.handleIncorrectAnswer(playerName, songTitle, songArtist, playerGuess, playerScore)
    }
  }

  // Helper to get context stats for debugging
  getContextSummary(): string {
    if (!this.gameContext) return 'No active game context'
    
    const ctx = this.gameContext
    return `Game: ${ctx.playlistName} | Round: ${ctx.currentRound}/${ctx.totalQuestions} | Score: ${ctx.playerScore} | Streak: ${ctx.currentStreak} | Record: ${ctx.correctCount}W-${ctx.incorrectCount}L`
  }
}

// Export singleton instance
export const gameHost = new GameHostManager()

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).gameHost = gameHost
}