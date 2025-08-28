import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { gameHost } from '../services/gameHostManager'
import './AIHost.css'

interface AIHostProps {
  gamePhase: 'question_start' | 'correct_answer' | 'wrong_answer' | 'round_end' | 'game_end'
  playerName: string
  playerScore: number
  opponentScore: number
  songTitle?: string
  songArtist?: string
  isCorrect?: boolean
  character: string
  enabled?: boolean
  voiceEnabled?: boolean
  gameIntroPlaying?: boolean // Add this to disable during intro
}

export interface AIHostRef {
  stopAudio: () => void
}

interface CharacterInfo {
  name: string
  emoji: string
  personality: string
}

const getCharacterInfo = (characterId: string): CharacterInfo => {
  const characters: Record<string, CharacterInfo> = {
    riley: { name: 'Riley', emoji: '🎤', personality: 'energetic' },
    willow: { name: 'Willow', emoji: '🌿', personality: 'wise' },
    alex: { name: 'Alex', emoji: '🎧', personality: 'cool' },
    jordan: { name: 'Jordan', emoji: '😄', personality: 'funny' }
  }
  return characters[characterId] || characters.riley
}

// Fallback responses when OpenAI is rate limited - character specific
const getFallbackComment = (
  gamePhase: string,
  character: string,
  _isCorrect?: boolean, 
  songTitle?: string, 
  songArtist?: string
): string => {
  const characterResponses = {
    riley: {
      question_start: ["Let's see what you've got!", "Here we go! This is exciting!", "Ready for this one?"],
      correct_answer: ["YES! You nailed it!", "Perfect! You're on fire!", "Outstanding work!", "Brilliant! That was amazing!"],
      wrong_answer: [`Not quite! That was ${songTitle} by ${songArtist}.`, "Keep going! You've got this!", "Nice try! Better luck next time!"],
      round_end: ["What an amazing round!", "You're doing fantastic!", "Keep that energy up!"],
      game_end: ["What a fantastic game! You were incredible!"]
    },
    willow: {
      question_start: ["Take your time with this one", "Listen deeply to this melody", "Feel the music guide you"],
      correct_answer: ["Beautifully done! Your intuition served you well", "Yes, you felt that one perfectly", "Your musical spirit shines through", "Wonderfully attuned!"],
      wrong_answer: [`That was ${songTitle} by ${songArtist}. Every song teaches us something`, "No worries, each guess brings wisdom", "Music speaks to us all differently"],
      round_end: ["You're growing with each song", "Your musical journey continues beautifully", "Trust in your evolving ear"],
      game_end: ["What a meaningful musical journey we've shared"]
    },
    alex: {
      question_start: ["Alright, let's vibe with this one", "Here's a good one", "Let's see if you know this track"],
      correct_answer: ["Nice! You know your music", "Smooth! That was clean", "Right on! Good ear", "Sweet! You got it"],
      wrong_answer: [`Nah, that was ${songTitle} by ${songArtist}`, "Close, but not quite there", "Keep listening, you'll get it"],
      round_end: ["Solid round", "You're flowing well", "Nice rhythm so far"],
      game_end: ["Good session! You've got taste"]
    },
    jordan: {
      question_start: ["Buckle up for this one!", "Oh, this is gonna be good!", "Ready to have some fun?"],
      correct_answer: ["BAM! You crushed it!", "Woohoo! That was perfect!", "Oh snap! You're good at this!", "Comedy gold! I mean... music gold!"],
      wrong_answer: [`Oops! That was actually ${songTitle} by ${songArtist}`, "Nice try, but that's a no from me!", "So close, yet so far!"],
      round_end: ["You're cracking me up with these moves!", "This is getting interesting!", "Plot twist coming up!"],
      game_end: ["What a wild ride! Thanks for the laughs!"]
    }
  }

  const responses = characterResponses[character as keyof typeof characterResponses] || characterResponses.riley
  const phaseResponses = responses[gamePhase as keyof typeof responses] || ["Great job playing along!"]
  
  return Array.isArray(phaseResponses) 
    ? phaseResponses[Math.floor(Math.random() * phaseResponses.length)]
    : phaseResponses
}

const AIHost = forwardRef<AIHostRef, AIHostProps>(({
  gamePhase,
  playerName,
  playerScore,
  opponentScore,
  songTitle,
  songArtist,
  isCorrect,
  character,
  enabled = true,
  voiceEnabled = true,
  gameIntroPlaying = false
}, ref) => {
  // COMPLETE DISABLE during intro
  if (gameIntroPlaying) {
    return null
  }
  const characterInfo = getCharacterInfo(character)
  const [comment, setComment] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const [lastRequestTime, setLastRequestTime] = useState<number>(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  
  const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between OpenAI requests

  // Expose method to stop audio from parent component
  const stopAudio = () => {
    console.log('🎤 AIHOST: stopAudio called', { 
      hasAudioRef: !!audioRef.current, 
      isPlaying, 
      currentSrc: audioRef.current?.src 
    })
    
    const audio = audioRef.current
    if (audio) {
      console.log('🎤 AIHOST: Stopping audio due to user action')
      audio.pause()
      audio.currentTime = 0
      setIsPlaying(false)
      // Remove aggressive src clearing to avoid conflicts with song audio
    } else {
      console.log('🎤 AIHOST: No audio ref available to stop')
    }
  }

  // Expose the stopAudio method via imperative handle
  useImperativeHandle(ref, () => ({
    stopAudio
  }), [])

  useEffect(() => {
    console.log('🎤 AIHOST: useEffect triggered', { 
      enabled, 
      initialized: gameHost.isInitialized(), 
      gamePhase, 
      playerScore, 
      opponentScore,
      character
    })
    
    if (!enabled || !gameHost.isInitialized()) {
      console.log('🎤 AIHOST: Not enabled or not initialized, waiting for Game component to initialize...')
      // Let the Game component handle initialization with the correct personality
      return
    }

    // Add a small delay to ensure gameHost initialization is complete
    console.log('🎤 AIHOST: Scheduling generateHostComment...')
    const timer = setTimeout(() => {
      console.log('🎤 AIHOST: Calling generateHostComment after delay...')
      generateHostComment()
    }, 100) // Small delay to ensure initialization is complete

    return () => clearTimeout(timer)
  }, [gamePhase, playerScore, opponentScore, enabled, character])

  const generateHostComment = async () => {
    console.log('🎤 AIHOST: generateHostComment called')
    if (!gameHost.isInitialized()) {
      console.log('🎤 AIHOST: gameHost not initialized, returning')
      return
    }

    console.log('🎤 AIHOST: Starting generation for gamePhase:', gamePhase)
    setIsGenerating(true)
    setShowComment(false)
    
    try {
      let response: { text: string; audioUrl?: string }
      const now = Date.now()
      const timeSinceLastRequest = now - lastRequestTime
      
      // Use fallback if rate limiting
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        console.log('🎤 AIHOST: Using fallback due to rate limiting')
        response = { text: getFallbackComment(gamePhase, character, isCorrect, songTitle, songArtist) }
      } else {
        try {
          setLastRequestTime(now)
          
          // Use appropriate gameHost method based on game phase
          if (gamePhase === 'correct_answer' && isCorrect) {
            console.log('🎤 AIHOST: Generating celebration response')
            response = await gameHost.celebrateCorrectAnswer(
              playerName, 
              playerScore, 
              songTitle || 'the song', 
              songArtist || 'the artist',
              '', // playerGuess - empty for now
              { generateVoice: true }
            )
          } else if (gamePhase === 'wrong_answer' && !isCorrect) {
            console.log('🎤 AIHOST: Generating encouragement response')
            response = await gameHost.handleIncorrectAnswer(
              playerName, 
              songTitle || 'the song', 
              songArtist || 'the artist',
              '', // playerGuess - empty for now
              playerScore,
              { generateVoice: true }
            )
          } else if (gamePhase === 'question_start') {
            // Skip generating responses during question start - no host commentary needed
            return
          } else if (gamePhase === 'round_end') {
            // Skip generating responses during round end - no banter between questions
            return
          } else if (gamePhase === 'game_end') {
            console.log('🎤 AIHOST: Generating game end response')
            response = await gameHost.handleGameEnd(
              playerScore, 
              5, // totalQuestions 
              'Quiz Game',
              playerName,
              { generateVoice: true }
            )
          } else {
            console.log('🎤 AIHOST: Using fallback for phase:', gamePhase)
            // Use fallback for other phases
            response = { text: getFallbackComment(gamePhase, character, isCorrect, songTitle, songArtist) }
          }
          
          console.log('🎤 AIHOST: Generated response:', { text: response.text, hasAudio: !!response.audioUrl })
        } catch (error: any) {
          console.warn('🎤 AIHOST: Using fallback due to API error:', error)
          response = { text: getFallbackComment(gamePhase, character, isCorrect, songTitle, songArtist) }
        }
      }

      console.log('🎤 AIHOST: Setting comment and showing:', response.text)
      setComment(response.text)
      setShowComment(true)

      // Use audio from gameHost response if available
      if (voiceEnabled && response.audioUrl) {
        console.log('🎤 AIHOST: Playing audio from response:', response.audioUrl.substring(0, 50) + '...')
        setAudioUrl(response.audioUrl)
        // Play audio immediately after setting URL
        setTimeout(() => {
          if (audioRef.current && response.audioUrl) {
            console.log('🎤 AIHOST: Actually playing audio now...')
            audioRef.current.src = response.audioUrl
            audioRef.current.play().then(() => {
              console.log('🎤 AIHOST: Audio playback started successfully - AUTO PLAY')
              setIsPlaying(true)
            }).catch(error => {
              console.error('🎤 AIHOST: Audio play failed:', error)
            })
          } else {
            console.log('🎤 AIHOST: audioRef or audioUrl not available for playback')
          }
        }, 100) // Shorter delay
      } else {
        console.log('🎤 AIHOST: No audio to play (voiceEnabled:', voiceEnabled, ', hasAudio:', !!response.audioUrl, ')')
      }
    } catch (error) {
      console.error('Failed to generate AI comment:', error)
      // Fall back to silent operation if AI fails
    } finally {
      setIsGenerating(false)
    }
  }

  // Note: TTS generation is now handled by the gameHost service
  // This method is kept for compatibility but may not be used

  const playVoice = () => {
    console.log('🎤 AIHOST: playVoice called', { hasRef: !!audioRef.current, audioUrl: audioUrl.substring(0, 50) + '...' })
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl
      audioRef.current.play().then(() => {
        console.log('🎤 AIHOST: playVoice succeeded')
        setIsPlaying(true)
      }).catch(error => {
        console.error('🎤 AIHOST: playVoice failed:', error)
      })
    } else {
      console.log('🎤 AIHOST: playVoice - missing ref or audioUrl')
    }
  }

  const handleAudioEnd = () => {
    console.log('🎤 AIHOST: Audio ended')
    setIsPlaying(false)
  }

  const handleAudioStart = () => {
    console.log('🎤 AIHOST: Audio actually started playing')
    setIsPlaying(true)
  }

  const handleAudioPause = () => {
    console.log('🎤 AIHOST: Audio paused')
    setIsPlaying(false)
  }

  // Clean up audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  if (!enabled) {
    return null
  }

  return (
    <div className={`ai-host ${showComment || isGenerating ? 'active' : ''}`}>
      <div className="host-avatar">
        <div className={`avatar-icon ${isGenerating ? 'thinking' : ''} ${isPlaying ? 'speaking' : ''}`}>
          {characterInfo.emoji}
        </div>
        <div className="host-name">{characterInfo.name}</div>
      </div>
      
      {showComment && (
        <div className="host-comment">
          <div className={`comment-bubble ${comment === '[no response]' ? 'no-response' : ''}`}>
            {comment === '[no response]' ? (
              <span className="no-response-text">[no response]</span>
            ) : (
              comment
            )}
          </div>
          
          {voiceEnabled && audioUrl && comment !== '[no response]' && (
            <button 
              className={`voice-button ${isPlaying ? 'playing' : ''}`}
              onClick={playVoice}
              disabled={isPlaying}
            >
              {isPlaying ? '🔊' : '🔇'}
            </button>
          )}
        </div>
      )}

      <audio
        ref={audioRef}
        onEnded={handleAudioEnd}
        onPlay={handleAudioStart}
        onPause={handleAudioPause}
        style={{ display: 'none' }}
      />

      {isGenerating && (
        <div className="generating-indicator">
          <div className="thinking-dots">
            <span>Thinking</span>
            <span>•</span>
            <span>•</span>
            <span>•</span>
          </div>
        </div>
      )}
    </div>
  )
})

AIHost.displayName = 'AIHost'

export default AIHost
