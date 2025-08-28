import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AIHost, { type AIHostRef } from './AIHost'
import { deepgramService, type DeepgramResponse } from '../services/deepgramService'
import { gameHost } from '../services/gameHostManager'
import './Game.css'

interface Song {
  id: string
  title: string
  artist: string
  file: string
  albumArt: string
  alternatives: string[]
  artistAlternatives?: string[] // Alternative spellings/pronunciations for artist names
}

interface QuizQuestion {
  song: Song
  options: string[]
  correctAnswer: string
}

type AIHostPhase = 'question_start' | 'correct_answer' | 'wrong_answer' | 'round_end' | 'game_end'

const Game = () => {
  const navigate = useNavigate()
  const { playlist } = useParams<{ playlist: string }>()
  const audioRef = useRef<HTMLAudioElement>(null)
  
  // Sound effect refs
  const correctAnswerSfxRef = useRef<HTMLAudioElement>(null)
  const victoryApplauseSfxRef = useRef<HTMLAudioElement>(null)
  
  // AI Host ref for stopping speech
  const aiHostRef = useRef<AIHostRef>(null)
  
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [score, setScore] = useState(0)
  const [opponentScore, setOpponentScore] = useState(0)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [artistCorrect, setArtistCorrect] = useState(false)
  const [songCorrect, setSongCorrect] = useState(false)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [opponentCorrect, setOpponentCorrect] = useState(false)
  const [gameComplete, setGameComplete] = useState(false)
  const totalQuestions = 5

  // Speech Recognition state
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [latestTranscript, setLatestTranscript] = useState('')

  // Track used songs to prevent duplicates within the same game
  const [usedSongIds, setUsedSongIds] = useState<string[]>([])
  
  // Prevent multiple simultaneous question loading
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false)

  // AI Host state - smart timing to avoid audio conflicts
  const [hostPhase, setHostPhase] = useState<AIHostPhase>('question_start')
  const [selectedHost, setSelectedHost] = useState<string>('riley')
  const [playerName, setPlayerName] = useState<string>('Player')
  const [gameIntroPlaying, setGameIntroPlaying] = useState(true) // New state for game intro
  const [waitingForHostSpeech, setWaitingForHostSpeech] = useState(false)
  const introExecutedRef = useRef<string | null>(null) // Track which playlist intro was executed

  // Load player name and selected AI Host character from localStorage
  const [hostLoadedFromStorage, setHostLoadedFromStorage] = useState(false)
  
  useEffect(() => {
    // Check for reset parameter in URL
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('resetHost') === 'true') {
      console.log('🎪 HOSTMANAGER: Resetting host selection to default (riley)')
      localStorage.removeItem('selectedAIHost')
      setSelectedHost('riley')
      setHostLoadedFromStorage(true)
      return
    }

    const savedHost = localStorage.getItem('selectedAIHost')
    if (savedHost) {
      console.log('🎪 HOSTMANAGER: Loaded host from localStorage:', savedHost)
      setSelectedHost(savedHost)
    } else {
      console.log('🎪 HOSTMANAGER: No saved host, using default: riley')
    }
    
    const savedPlayerName = localStorage.getItem('playerName')
    if (savedPlayerName) {
      setPlayerName(savedPlayerName)
    }
    
    setHostLoadedFromStorage(true)
  }, [])

  // Initialize AI Host service when component mounts with selected personality
  useEffect(() => {
    if (selectedHost === 'none') {
      console.log('🎪 HOSTMANAGER: Host disabled by user choice ("No Host" selected)')
      console.log('🎪 HOSTMANAGER: To re-enable, go to the landing page and select a different host')
      return
    }
    
    console.log('🎪 HOSTMANAGER: Initializing host:', selectedHost)
    gameHost.initialize(selectedHost).catch(error => {
      console.warn('🎪 HOSTMANAGER: Initialization failed:', error)
    })
  }, [selectedHost])

  // Check Deepgram support on component mount
  useEffect(() => {
    const isSupported = deepgramService.isReady()
    setSpeechSupported(isSupported)
    
    // Disable speech if not supported
    if (!isSupported) {
      setSpeechEnabled(false)
      console.log(deepgramService.getConfigurationHelp())
    }
  }, [])
  
  // 2010s playlist songs with curated alternatives
  const songs2010s: Song[] = [
    { 
      id: '1', 
      title: 'All of Me', 
      artist: 'John Legend', 
      file: '/songs/2010s/AllofMeJohnLegend.mp3', 
      albumArt: '/assets/album-art/2010s/AllOfMeJohnLegend.jpeg',
      alternatives: ['When I Was Your Man - Bruno Mars', 'Stay With Me - Sam Smith', 'Thinking Out Loud - Ed Sheeran']
    },
    { 
      id: '2', 
      title: 'All The Stars', 
      artist: 'Kendrick Lamar', 
      file: '/songs/2010s/AllTheStarsKendrick.mp3', 
      albumArt: '/assets/album-art/2010s/AllOfTheStarsKendrick.jpeg',
      alternatives: ['Location - Khalid', 'Love on the Brain - Rihanna', 'Pretty Little Fears - 6LACK feat. J. Cole'],
      artistAlternatives: ['Kendrick Lamarr', 'Kendrick', 'Lamar']
    },
    { 
      id: '3', 
      title: 'Closer', 
      artist: 'The Chainsmokers', 
      file: '/songs/2010s/CloserChainsmokers.mp3', 
      albumArt: '/assets/album-art/2010s/CloserChainsmokers.jpeg',
      alternatives: ['It Ain\'t Me - Kygo & Selena Gomez', 'Faded - Zedd feat. Alessia Cara', 'Paris - Lauv'],
      artistAlternatives: ['Chainsmokers', 'Chain Smokers', 'Chainsmockers']
    },
    { 
      id: '4', 
      title: 'Goosebumps', 
      artist: 'Travis Scott', 
      file: '/songs/2010s/GoosebumpsTravisScott.mp3', 
      albumArt: '/assets/album-art/2010s/GoosebumpsTravisScott.jpeg',
      alternatives: ['Lucid Dreams - Juice WRLD', 'Life Goes On - Lil Baby feat. Gunna & Lil Uzi Vert', 'Psycho - Post Malone feat. Ty Dolla $ign']
    },
    { 
      id: '5', 
      title: 'HUMBLE', 
      artist: 'Kendrick Lamar', 
      file: '/songs/2010s/HUMBLEKendrickLamar.mp3', 
      albumArt: '/assets/album-art/2010s/HUMBLEKendrickLamar.jpeg',
      alternatives: ['Mask Off - Future', 'Bad and Boujee - Migos feat. Lil Uzi Vert', 'Alright - J. Cole'],
      artistAlternatives: ['Kendrick Lamarr', 'Kendrick', 'Lamar']
    },
    { 
      id: '6', 
      title: 'Low', 
      artist: 'Flo Rida', 
      file: '/songs/2010s/LowFloRida.mp3', 
      albumArt: '/assets/album-art/2010s/LowFloRida.jpeg',
      alternatives: ['Buy U a Drank - T-Pain feat. Yung Joc', 'Temperature - Sean Paul', 'Tipsy - J-Kwon'],
      artistAlternatives: ['Flow Rider', 'Flow Rida', 'Flo Rider', 'Florida']
    },
    { 
      id: '7', 
      title: 'One Dance', 
      artist: 'Drake', 
      file: '/songs/2010s/OneDanceDrake.mp3', 
      albumArt: '/assets/album-art/2010s/OneDanceDrake.jpeg',
      alternatives: ['Joanna - Afro B', 'On the Low - Burna Boy', 'Toast - Koffee']
    },
    { 
      id: '8', 
      title: 'Shut Up and Dance', 
      artist: 'Walk the Moon', 
      file: '/songs/2010s/ShupUpAndDance.mp3', 
      albumArt: '/assets/album-art/2010s/ShutUpAndDance.jpeg',
      alternatives: ['Fireflies - Owl City', 'Safe and Sound - Capital Cities', 'Cool Kids - Echosmith']
    },
    { 
      id: '9', 
      title: 'Sweater Weather', 
      artist: 'The Neighbourhood', 
      file: '/songs/2010s/SweaterWeatherTheNeighborhood.mp3', 
      albumArt: '/assets/album-art/2010s/SweaterWeatherTheNeighborhood.jpeg',
      alternatives: ['Sex - The 1975', 'Riptide - Vance Joy', 'Youth - Daughter'],
      artistAlternatives: ['Neighbourhood', 'Neighborhood', 'The Neighborhood']
    },
    { 
      id: '10', 
      title: 'Wake Me Up', 
      artist: 'Avicii', 
      file: '/songs/2010s/WakeMeUpAvicii.mp3', 
      albumArt: '/assets/album-art/2010s/WakeMeUpAvicii.jpeg',
      alternatives: ['Broken Arrows - Kygo', 'The Nights - Martin Garrix', 'Sunburst - Tobtok']
    }
  ]

  // 2000s playlist songs with curated alternatives
  const songs2000s: Song[] = [
    { 
      id: '1', 
      title: 'Complicated', 
      artist: 'Avril Lavigne', 
      file: '/songs/2000s/ComplicatedAvrilLavigne.mp3', 
      albumArt: '/assets/album-art/2000s/ComplicatedAvrilLavigne.jpeg',
      alternatives: ['Sk8er Boi - Simple Plan', 'Everywhere - Michelle Branch', 'Since U Been Gone - Kelly Clarkson']
    },
    { 
      id: '2', 
      title: 'Empire State of Mind', 
      artist: 'Jay Z (feat. Alicia Keys)', 
      file: '/songs/2000s/EmpireStateOfMindJayZ.mp3', 
      albumArt: '/assets/album-art/2000s/EmpireStateOfMindJayZ.jpeg',
      alternatives: ['Run This Town - Jay-Z, Rihanna & Kanye West', 'Nothin\' on You - B.o.B feat. Bruno Mars', 'All of the Lights - Kanye West feat. Rihanna & Kid Cudi']
    },
    { 
      id: '3', 
      title: 'Fireflies', 
      artist: 'Owl City', 
      file: '/songs/2000s/FirefliesOwlCity.mp3', 
      albumArt: '/assets/album-art/2000s/FirefliesOwlCity.jpeg',
      alternatives: ['Safe and Sound - Capital Cities', 'Shut Up and Dance - Walk The Moon', 'Electric Feel - MGMT']
    },
    { 
      id: '4', 
      title: 'Gimme More', 
      artist: 'Britney Spears', 
      file: '/songs/2000s/GimmeMoreBritneySpears.mp3', 
      albumArt: '/assets/album-art/2000s/GimmeMoreBritneySpears.jpeg',
      alternatives: ['Just Dance - Lady Gaga', 'Can\'t Get You Out of My Head - Kylie Minogue', 'Dirrty - Christina Aguilera']
    },
    { 
      id: '5', 
      title: 'I Want It That Way', 
      artist: 'Backstreet Boys', 
      file: '/songs/2000s/IWantItThatWayBackstreetBoys.mp3', 
      albumArt: '/assets/album-art/2000s/IWantItThatWayBackstreetBoys.jpeg',
      alternatives: ['Tearin\' Up My Heart - *NSYNC', 'Flying Without Wings - Westlife', 'Because of You - 98 Degrees']
    },
    { 
      id: '6', 
      title: 'The Middle', 
      artist: 'Jimmy Eat World', 
      file: '/songs/2000s/TheMiddleJimmyEatWorld.mp3', 
      albumArt: '/assets/album-art/2000s/TheMiddleJimmyEatWorld.jpeg',
      alternatives: ['Ocean Avenue - Yellowcard', 'Sugar, We\'re Goin Down - Fall Out Boy', 'Absolutely (Story of a Girl) - Nine Days']
    },
    { 
      id: '7', 
      title: 'Unwritten', 
      artist: 'Natasha Bedingfield', 
      file: '/songs/2000s/UnwrittenNatashaBedingfield.mp3', 
      albumArt: '/assets/album-art/2000s/UnwrittenNatashaBedingfield.jpeg',
      alternatives: ['Pocketful of Sunshine - Natasha Bedingfield', 'Breakaway - Kelly Clarkson', 'Suddenly I See - KT Tunstall']
    },
    { 
      id: '8', 
      title: 'Viva La Vida', 
      artist: 'Coldplay', 
      file: '/songs/2000s/VivaLaVidaColdplay.mp3', 
      albumArt: '/assets/album-art/2000s/VivaLaVidaColdplay.jpeg',
      alternatives: ['Chasing Cars - Snow Patrol', 'Clocks - Keane', 'Somewhere Only We Know - Keane']
    },
    { 
      id: '9', 
      title: 'Without Me', 
      artist: 'Eminem', 
      file: '/songs/2000s/WithoutMeEminem.mp3', 
      albumArt: '/assets/album-art/2000s/WithoutMeEminem.jpeg',
      alternatives: ['Forgot About Dre - Dr. Dre feat. Eminem', 'Hot in Herre - Nelly', 'In da Club - 50 Cent']
    }
  ]

  // 2020s playlist songs with curated alternatives
  const songs2020s: Song[] = [
    { 
      id: '1', 
      title: 'Cardigan', 
      artist: 'Taylor Swift', 
      file: '/songs/2020s/CardiganTaylorSwift.mp3', 
      albumArt: '/assets/album-art/2020s/CardiganTaylorSwift.jpeg',
      alternatives: ['Liability - Lorde', 'Celeste - Ezra Vine', 'Fine Line - Harry Styles']
    },
    { 
      id: '2', 
      title: 'Enemy', 
      artist: 'Imagine Dragons', 
      file: '/songs/2020s/EnemyImagineDragons.mp3', 
      albumArt: '/assets/album-art/2020s/EnemyImagineDragons.jpeg',
      alternatives: ['Believer - OneRepublic', 'Centuries - Fall Out Boy', 'Radioactive - AWOLNATION']
    },
    { 
      id: '3', 
      title: 'Good Luck, Babe', 
      artist: 'Chappell Roan', 
      file: '/songs/2020s/GoodLuckBabeChappellRoan.mp3', 
      albumArt: '/assets/album-art/2020s/GoodLuckBabeChappellRoan.jpeg',
      alternatives: ['Strangers - Halsey feat. Lauren Jauregui', 'Green Light - Lorde', 'Stayaway - MUNA'],
      artistAlternatives: ['Chapel Roan', 'Chapelle Roan', 'Chappel Roan']
    },
    { 
      id: '4', 
      title: 'Here With Me', 
      artist: 'd4vd', 
      file: '/songs/2020s/HereWithMed4vd.mp3', 
      albumArt: '/assets/album-art/2020s/HereWithMed4vd.jpeg',
      alternatives: ['Romantic Homicide - d4vd', 'comethru - Jeremy Zucker', 'idontwannabeyouanymore - Billie Eilish'],
      artistAlternatives: ['David', 'D4VD', 'D four V D', 'Dee Four Vee Dee']
    },
    { 
      id: '5', 
      title: 'Snooze', 
      artist: 'SZA', 
      file: '/songs/2020s/SnoozeSZA.mp3', 
      albumArt: '/assets/album-art/2020s/SnoozeSZA.jpeg',
      alternatives: ['Nights - Frank Ocean', 'After Dark - Drake feat. Static Major & Ty Dolla $ign', 'Find Someone Like You - Snoh Aalegra'],
      artistAlternatives: ['Essa', 'S-Z-A', 'Sza', 'Solana']
    },
    { 
      id: '6', 
      title: 'Taste', 
      artist: 'Sabrina Carpenter', 
      file: '/songs/2020s/TasteSabrinaCarpenter.mp3', 
      albumArt: '/assets/album-art/2020s/TasteSabrinaCarpenter.jpeg',
      alternatives: ['Good Ones - Charli XCX', 'Sweet but Psycho - Ava Max', 'Don\'t Call Me Up - Mabel']
    },
    { 
      id: '7', 
      title: 'the boy is mine', 
      artist: 'Ariana Grande', 
      file: '/songs/2020s/TheBoyIsMineArianaGrande.mp3', 
      albumArt: '/assets/album-art/2020s/TheBoyIsMineArianaGrande.jpeg',
      alternatives: ['No Tears Left to Cry - Dua Lipa', 'Say So - Doja Cat', 'Levitating - Dua Lipa feat. DaBaby']
    },
    { 
      id: '8', 
      title: 'Too Many Nights', 
      artist: 'Metro Boomin', 
      file: '/songs/2020s/TooManyNightsMetroBoomin.mp3', 
      albumArt: '/assets/album-art/2020s/TooManyNightsMetroBoomin.jpeg',
      alternatives: ['Knife Talk - Drake feat. 21 Savage', 'Bank Account - 21 Savage', 'Life Goes On - Lil Baby & Gunna'],
      artistAlternatives: ['Metro Booming', 'Metro Boomin\'', 'Metro']
    },
    { 
      id: '9', 
      title: 'Traitor', 
      artist: 'Olivia Rodrigo', 
      file: '/songs/2020s/TraitorOliviaRodrigo.mp3', 
      albumArt: '/assets/album-art/2020s/TraitorOliviaRodrigo.jpeg',
      alternatives: ['drivers license - Conan Gray', 'Moral of the Story - Ashe', 'You Broke Me First - Tate McRae']
    },
    { 
      id: '10', 
      title: 'Woman', 
      artist: 'Doja Cat', 
      file: '/songs/2020s/WomanDojaCat.mp3', 
      albumArt: '/assets/album-art/2020s/WomanDojaCat.jpeg',
      alternatives: ['Kiss Me More - Saweetie feat. H.E.R.', 'Savage Remix - Megan Thee Stallion feat. Beyoncé', 'Truth Hurts - Lizzo']
    }
  ]

  const getPlaylistSongs = (playlistName: string): Song[] => {
    switch (playlistName) {
      case '2020s':
        return songs2020s
      case '2010s':
        return songs2010s
      case '2000s':
        return songs2000s
      default:
        return songs2010s // Default to 2010s if playlist not found
    }
  }

  const generateQuizQuestion = (): QuizQuestion => {
    const playlistSongs = getPlaylistSongs(playlist || '2010s')
    
    // Filter out songs that have already been used in this game
    const availableSongs = playlistSongs.filter(song => !usedSongIds.includes(song.id))
    
    // If all songs have been used, reset and use all songs again (shouldn't happen with 5 questions)
    const songsToChooseFrom = availableSongs.length > 0 ? availableSongs : playlistSongs
    
    const randomIndex = Math.floor(Math.random() * songsToChooseFrom.length)
    const correctSong = songsToChooseFrom[randomIndex]
    
    // Add this song to the used list
    setUsedSongIds(prev => [...prev, correctSong.id])
    
    // Use curated alternatives for this song
    const wrongAnswers = correctSong.alternatives
    
    const correctAnswer = `${correctSong.title} - ${correctSong.artist}`
    const options = [...wrongAnswers, correctAnswer].sort(() => Math.random() - 0.5)
    
    return {
      song: correctSong,
      options,
      correctAnswer
    }
  }

  const startNewQuestion = () => {
    // Prevent multiple simultaneous calls
    if (isLoadingQuestion) return
    setIsLoadingQuestion(true)
    
    // Stop and reset any currently playing audio
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      setIsPlaying(false)
      setCurrentTime(0)
    }
    
    const question = generateQuizQuestion()
    setCurrentQuestion(question)
    setSelectedAnswer(null)
    setShowFeedback(false)
    setIsCorrect(false)
    setArtistCorrect(false)
    setSongCorrect(false)
    setPointsEarned(0)
    setLatestTranscript('')
    
    // Auto-play the song after audio element has loaded the new source
    setTimeout(() => {
      const audioElement = audioRef.current
      console.log('🎵 GAME: Attempting to auto-play new song:', {
        hasAudioElement: !!audioElement,
        currentSrc: audioElement?.src,
        expectedFile: question.song.file,
        isLoadingQuestion
      })
      
      if (audioElement && audioElement.src.includes(question.song.file.split('/').pop() || '')) {
        console.log('🎵 GAME: Starting audio playback for:', question.song.title)
        audioElement.play().then(() => {
          console.log('🎵 GAME: Audio playback started successfully')
          setIsPlaying(true)
          setIsLoadingQuestion(false)
        }).catch(error => {
          console.error('🎵 GAME: Auto-play failed:', error)
          setIsPlaying(false)
          setIsLoadingQuestion(false)
        })
      } else {
        console.log('🎵 GAME: Audio element or src mismatch, skipping auto-play')
        setIsLoadingQuestion(false)
      }
    }, 500)
    
    // No AI host during question phase - only during feedback
  }

  useEffect(() => {
    console.log('🎮 GAME: useEffect [playlist, selectedHost, hostLoadedFromStorage] triggered with:', { playlist, selectedHost, hostLoadedFromStorage })
    
    // Don't start until playlist, selectedHost, and hostLoadedFromStorage are ready
    if (!playlist) {
      console.log('🎮 GAME: Waiting for playlist to be set')
      return
    }
    
    if (!hostLoadedFromStorage) {
      console.log('🎮 GAME: Waiting for host to be loaded from storage')
      return
    }
    
    // Check if we've already done intro for this playlist
    if (introExecutedRef.current === playlist) {
      console.log('🎮 GAME: Intro already executed for playlist:', playlist, '- skipping')
      return
    }
    
    console.log('🎮 GAME: First time seeing playlist:', playlist, 'with host:', selectedHost, '- executing intro')
    introExecutedRef.current = playlist || null
    
    setUsedSongIds([]) // Reset used songs when playlist changes
    startGameWithIntro()
  }, [playlist, selectedHost, hostLoadedFromStorage])

  const startGameWithIntro = async () => {
    console.log('🎮 GAME: startGameWithIntro called, selectedHost:', selectedHost)
    
    if (selectedHost === 'none') {
      // No AI host, start game immediately
      console.log('🎮 GAME: No AI host selected, starting game immediately')
      setGameIntroPlaying(false)
      startNewQuestion()
      return
    }

    // Wait for gameHost to initialize if not already
    if (!gameHost.isInitialized()) {
      console.log('🎮 GAME: GameHost not initialized, initializing with personality:', selectedHost)
      setWaitingForHostSpeech(true)
      const initialized = await gameHost.initialize(selectedHost)
      if (!initialized) {
        // Failed to initialize, start without host
        console.log('🎮 GAME: GameHost initialization failed, starting without host')
        setGameIntroPlaying(false)
        setWaitingForHostSpeech(false)
        startNewQuestion()
        return
      }
    }

    try {
      // Get AI host game introduction
      console.log('🎮 GAME: Requesting AI host game introduction...')
      setWaitingForHostSpeech(true)
      const playlistName = playlist || '2010s'
      const intro = await gameHost.announceGameIntro(playlistName, playerName, 5, { generateVoice: true })
      console.log('🎮 GAME: Received intro response:', { text: intro.text, hasAudio: !!intro.audioUrl })
      
      if (intro.audioUrl) {
        // Play the intro audio and wait for it to finish
        console.log('🎮 GAME: Playing intro audio from URL:', intro.audioUrl.substring(0, 50) + '...')
        const audio = new Audio(intro.audioUrl)
        audio.addEventListener('ended', () => {
          console.log('🎮 GAME: Intro audio ended, starting game')
          console.log('🎮 GAME: Setting gameIntroPlaying to false')
          setGameIntroPlaying(false)
          setWaitingForHostSpeech(false)
          startNewQuestion()
        })
        audio.play().then(() => {
          console.log('🎮 GAME: Intro audio playback started successfully')
        }).catch(error => {
          console.error('🎮 GAME: Failed to play intro audio:', error)
          setGameIntroPlaying(false)
          setWaitingForHostSpeech(false)
          startNewQuestion()
        })
      } else {
        console.log('🎮 GAME: No audio URL, proceeding with delay')
        // No audio, proceed after brief delay to show text
        setTimeout(() => {
          console.log('🎮 GAME: Delay finished, starting game')
          setGameIntroPlaying(false)
          setWaitingForHostSpeech(false)
          startNewQuestion()
        }, 2000)
      }
    } catch (error) {
      console.error('🎮 GAME: Failed to get game intro:', error)
      setGameIntroPlaying(false)
      setWaitingForHostSpeech(false)
      startNewQuestion()
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
    }
  }, [currentQuestion])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio || selectedAnswer) return // Don't allow play after answering

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(error => {
        console.error('Quiz Audio: Play failed:', error)
      })
    }
    setIsPlaying(!isPlaying)
  }

  const handleAnswerSelect = (answer: string, artistMatch?: boolean, songMatch?: boolean) => {
    if (selectedAnswer) return // Already answered
    
    // Stop speech recognition if active
    stopSpeechRecognition()
    
    setSelectedAnswer(answer)
    const playerCorrect = answer === currentQuestion?.correctAnswer
    setIsCorrect(playerCorrect)
    
    // Handle partial scoring for speech recognition
    if (artistMatch !== undefined && songMatch !== undefined) {
      // Speech recognition with partial scoring
      setArtistCorrect(artistMatch)
      setSongCorrect(songMatch)
      const points = (artistMatch ? 10 : 0) + (songMatch ? 10 : 0)
      setPointsEarned(points)
      
      // Play correct answer SFX if got at least part of the answer correct
      if (artistMatch || songMatch) {
        playCorrectAnswerSfx()
      }
    } else {
      // Traditional multiple choice - all or nothing
      if (playerCorrect) {
        setArtistCorrect(true)
        setSongCorrect(true)
        setPointsEarned(20)
        // Play correct answer SFX for traditional correct answer
        playCorrectAnswerSfx()
      } else {
        setArtistCorrect(false)
        setSongCorrect(false)
        setPointsEarned(0)
      }
    }
    
    // Update AI host based on answer
    const newPhase = (artistMatch || songMatch || playerCorrect) ? 'correct_answer' : 'wrong_answer'
    setHostPhase(newPhase)
    
    // Simulate opponent answer (40% chance of being correct)
    const opponentGetsItRight = Math.random() < 0.4
    setOpponentCorrect(opponentGetsItRight)
    
    setShowFeedback(true)
    
    // Pause audio
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      setIsPlaying(false)
    }
    
    // Award points based on new scoring system
    if (artistMatch !== undefined && songMatch !== undefined) {
      // Speech recognition with partial scoring
      const points = (artistMatch ? 10 : 0) + (songMatch ? 10 : 0)
      setScore(prev => prev + points)
    } else if (playerCorrect) {
      // Traditional multiple choice - full 20 points
      setScore(prev => prev + 20)
    }
    
    if (opponentGetsItRight) {
      // Opponent gets random partial or full score
      const opponentPoints = Math.random() < 0.5 ? 10 : 20
      setOpponentScore(prev => prev + opponentPoints)
    }
  }

  const nextQuestion = () => {
    console.log('🎮 GAME: nextQuestion called - attempting to stop AI Host audio')
    
    // Stop AI Host speech immediately when user clicks Next Question
    if (aiHostRef.current) {
      console.log('🎮 GAME: AI Host ref exists, calling stopAudio()')
      aiHostRef.current.stopAudio()
    } else {
      console.log('🎮 GAME: No AI Host ref available')
    }
    
    if (questionNumber >= totalQuestions) {
      setGameComplete(true)
      setHostPhase('game_end')
      
      // TEMPORARY: Play victory applause SFX regardless of win/loss to test audio
      setTimeout(() => {
        console.log('🎉 GAME: Checking victory condition:', { score, opponentScore, playerWon: score > opponentScore })
        console.log('🎉 GAME: TESTING - Playing applause regardless of outcome')
        playVictoryApplauseSfx()
        
        if (score > opponentScore) {
          console.log('🎉 GAME: Player won!')
        } else {
          console.log('🎉 GAME: Player did not win')
        }
      }, 500) // Small delay to allow results to appear first
    } else {
      setQuestionNumber(prev => prev + 1)
      setHostPhase('round_end')
      
      // Start new question after brief delay for AI commentary
      setTimeout(() => {
        startNewQuestion()
      }, 2000)
    }
  }

  const restartGame = () => {
    stopSpeechRecognition()
    setScore(0)
    setOpponentScore(0)
    setQuestionNumber(1)
    setGameComplete(false)
    setUsedSongIds([]) // Reset used songs for new game
    setIsLoadingQuestion(false) // Reset loading state
    startNewQuestion()
  }

  const backToPlaylist = () => {
    stopSpeechRecognition()
    navigate('/playlists')
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Sound effect functions
  const playCorrectAnswerSfx = () => {
    const sfx = correctAnswerSfxRef.current
    if (sfx) {
      sfx.currentTime = 0
      sfx.play().catch(error => {
        console.log('SFX: Correct answer sound failed to play:', error)
      })
    }
  }

  const playVictoryApplauseSfx = () => {
    console.log('🎉 SFX: playVictoryApplauseSfx called')
    console.log('🎉 SFX: Current game state:', { gameComplete, questionNumber, totalQuestions })
    
    // First, let's see what's in the DOM
    const allAudioElements = document.querySelectorAll('audio')
    console.log('🎉 SFX: ALL audio elements in DOM:', allAudioElements.length)
    
    for (let i = 0; i < allAudioElements.length; i++) {
      const audio = allAudioElements[i]
      console.log(`🎉 SFX: Audio ${i}:`, { 
        src: audio.src,
        outerHTML: audio.outerHTML.substring(0, 100) + '...',
        hasApplauseInSrc: audio.src.includes('sfx_sq_applause_correct_answer'),
        hasApplauseInHTML: audio.outerHTML.includes('sfx_sq_applause_correct_answer')
      })
    }
    
    // Try to find the audio element by ref first
    let sfx = victoryApplauseSfxRef.current
    console.log('🎉 SFX: Audio element via ref:', { 
      hasElement: !!sfx, 
      src: sfx?.src, 
      readyState: sfx?.readyState,
      duration: sfx?.duration
    })
    
    // If ref doesn't work, try to find it by DOM query as fallback
    if (!sfx) {
      console.log('🎉 SFX: Ref failed, trying DOM query fallback...')
      
      // Try multiple approaches to find the audio
      for (let i = 0; i < allAudioElements.length; i++) {
        const audio = allAudioElements[i]
        if (audio.src.includes('sfx_sq_applause_correct_answer') || 
            audio.outerHTML.includes('sfx_sq_applause_correct_answer')) {
          sfx = audio
          console.log('🎉 SFX: Found applause audio via DOM query at index:', i)
          break
        }
      }
    }
    
    if (sfx) {
      sfx.volume = 0.5 // Set to 50% volume as requested
      sfx.currentTime = 0
      console.log('🎉 SFX: Attempting to play victory applause at volume:', sfx.volume)
      
      sfx.play().then(() => {
        console.log('🎉 SFX: Victory applause started playing successfully')
      }).catch(error => {
        console.error('🎉 SFX: Victory applause sound failed to play:', error)
      })
    } else {
      console.error('🎉 SFX: No victory applause audio element found via ref OR DOM query!')
      console.log('🎉 SFX: victoryApplauseSfxRef.current:', victoryApplauseSfxRef.current)
    }
  }

  // Speech Recognition Functions
  const checkSpokenAnswer = (transcript: string): { answer: string | null, artistMatch: boolean, songMatch: boolean } => {
    if (!currentQuestion) return { answer: null, artistMatch: false, songMatch: false }
    
    const cleanTranscript = transcript.toLowerCase().trim()
    const songTitle = currentQuestion.song.title.toLowerCase()
    
    // Enhanced title matching - more flexible approach
    const hasTitle = checkSongTitleMatch(cleanTranscript, songTitle)
    
    // Improved artist matching - more flexible approach
    const hasArtist = checkArtistMatch(cleanTranscript, currentQuestion.song)
    
    // If we have at least one match, consider it a valid answer
    if (hasTitle || hasArtist) {
      return { 
        answer: currentQuestion.correctAnswer, 
        artistMatch: hasArtist, 
        songMatch: hasTitle 
      }
    }
    
    // Check against all possible answers for fallback
    for (const option of currentQuestion.options) {
      const optionLower = option.toLowerCase()
      if (cleanTranscript.includes(optionLower)) {
        // For multiple choice matches, we can't determine partial scores
        // so treat as full match if it's the correct answer
        const isCorrect = option === currentQuestion.correctAnswer
        return { 
          answer: option, 
          artistMatch: isCorrect, 
          songMatch: isCorrect 
        }
      }
    }
    
    return { answer: null, artistMatch: false, songMatch: false }
  }

  const checkSongTitleMatch = (transcript: string, songTitle: string): boolean => {
    // First try exact match
    if (transcript.includes(songTitle)) {
      return true
    }
    
    // Remove common punctuation and normalize spacing
    const cleanTitle = songTitle
      .replace(/[.,!?'"()]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spacing
      .trim()
    
    const cleanTranscript = transcript
      .replace(/[.,!?'"()]/g, '') // Remove punctuation  
      .replace(/\s+/g, ' ') // Normalize spacing
      .trim()
    
    // Try exact match with cleaned versions
    if (cleanTranscript.includes(cleanTitle)) {
      return true
    }
    
    // Split title into significant words (ignore common articles)
    const titleWords = cleanTitle
      .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
      .split(/\s+/)
      .filter(word => word.length > 2) // Only significant words
    
    // Check if transcript contains most of the significant title words
    if (titleWords.length > 0) {
      const matchedWords = titleWords.filter(word => 
        cleanTranscript.includes(word)
      )
      
      // Consider it a match if we have:
      // - All words for short titles (1-2 words)
      // - Most words for longer titles (>= 75% for 3+ words)
      const matchThreshold = titleWords.length <= 2 ? titleWords.length : Math.ceil(titleWords.length * 0.75)
      
      if (matchedWords.length >= matchThreshold) {
        return true
      }
    }
    
    // Handle partial word matching for single word titles
    if (titleWords.length === 1) {
      const titleWord = titleWords[0]
      
      // Check if transcript contains the title word as a substring of a spoken word
      const transcriptWords = cleanTranscript.split(/\s+/)
      for (const spokenWord of transcriptWords) {
        // Allow partial matches for words >= 4 chars if spoken word contains most of title
        if (titleWord.length >= 4 && spokenWord.includes(titleWord.substring(0, titleWord.length - 1))) {
          return true
        }
        // Allow title word to be contained in longer spoken word (e.g., "closer" contains "close")
        if (titleWord.includes(spokenWord) && spokenWord.length >= 3) {
          return true
        }
      }
    }
    
    return false
  }

  const checkArtistMatch = (transcript: string, song: Song): boolean => {
    // Clean the artist name - remove "(feat. ...)" and similar
    const artistName = song.artist.toLowerCase()
      .replace(/\s*\(feat\..*?\)/gi, '') // Remove "(feat. ...)"
      .replace(/\s*feat\..*$/gi, '') // Remove "feat. ..." at end
      .trim()
    
    // Helper function to check artist name matching
    const checkSingleArtistName = (name: string): boolean => {
      // First try exact match
      if (transcript.includes(name)) {
        return true
      }
      
      // Split artist name into words and remove common articles
      const artistWords = name
        .replace(/^the\s+/i, '') // Remove "The" at the beginning
        .split(/\s+/)
        .filter(word => word.length > 1) // Filter out single letters and short words
      
      // Check if any significant artist word appears in transcript
      for (const word of artistWords) {
        if (word.length >= 3 && transcript.includes(word)) {
          return true
        }
        // Special handling for common short artist names
        if (word.length === 2 && ['jay', 'ed', 'dj', 'mc', 'lil', 'big'].includes(word.toLowerCase()) && transcript.includes(word)) {
          return true
        }
      }
      
      // Handle special cases for common artist name patterns
      if (name.includes(' ')) {
        const [firstName, ...lastNames] = artistWords
        const lastName = lastNames.join(' ')
        
        // Check first name + last initial (e.g., "John L" for "John Legend")
        if (firstName && lastName && firstName.length >= 3) {
          const lastInitial = lastName.charAt(0)
          if (transcript.includes(firstName) && transcript.includes(lastInitial)) {
            return true
          }
        }
        
        // Check just last name for common single-name references
        if (lastName && lastName.length >= 4 && transcript.includes(lastName)) {
          return true
        }
      }
      
      return false
    }
    
    // Check against the main artist name
    if (checkSingleArtistName(artistName)) {
      return true
    }
    
    // Check against artist alternatives if they exist
    if (song.artistAlternatives && song.artistAlternatives.length > 0) {
      for (const alternative of song.artistAlternatives) {
        if (checkSingleArtistName(alternative.toLowerCase())) {
          return true
        }
      }
    }
    
    return false
  }

  const startSpeechRecognition = async () => {
    if (!speechSupported || !speechEnabled || selectedAnswer || isListening) return

    // Pause the audio when starting speech recognition
    const audio = audioRef.current
    if (audio && isPlaying) {
      audio.pause()
      setIsPlaying(false)
    }

    const success = await deepgramService.startListening(
      // onTranscript callback
      (response: DeepgramResponse) => {
        const transcript = response.transcript.toLowerCase().trim()
        
        // Store the latest transcript for manual stop processing
        if (transcript.length > 2) {
          setLatestTranscript(transcript)
        }
        
        // No automatic processing - user must manually stop recording
      },
      // onError callback
      (error: any) => {
        console.error('Deepgram error:', error)
        setIsListening(false)
      },
      // onStarted callback
      () => {
        setIsListening(true)
      },
      // onEnded callback
      () => {
        setIsListening(false)
      }
    )

    if (!success) {
      setIsListening(false)
    }
  }

  const stopSpeechRecognition = () => {
    deepgramService.stopListening()
    setIsListening(false)
  }

  const handleManualStopRecording = () => {
    stopSpeechRecognition()
    
    // Process the latest transcript if we have one
    if (latestTranscript.length > 2) {
      const result = checkSpokenAnswer(latestTranscript)
      if (result.answer) {
        handleAnswerSelect(result.answer, result.artistMatch, result.songMatch)
      } else {
        // If no match found, still submit as an incorrect answer to move to results
        handleAnswerSelect('no match found', false, false)
      }
    } else {
      // If no transcript captured, submit as incorrect to move to results
      handleAnswerSelect('no speech detected', false, false)
    }
  }

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      deepgramService.stopListening()
    }
  }, [])

  if (!currentQuestion) {
    return (
      <div className="game-loading">
        <div className="loading-content">
          <img 
            src="/assets/Opponent found.png" 
            alt="Opponent Found" 
            className="loading-image"
          />
          <h2 className="loading-title">Opponent Found!</h2>
          <p className="loading-subtitle">Preparing your musical challenge...</p>
        </div>
      </div>
    )
  }

  if (gameComplete) {
    return (
      <div className="game-container">
        <div className="game-content">
          <header className="game-header">
            <img 
              src="/assets/Song Quiz Horizontal logo.png" 
              alt="Song Quiz Logo" 
              className="game-logo"
            />
          </header>

          <main className="game-main">
            <div className="final-score">
              {score > opponentScore && (
                <div className="confetti-container">
                  <div className="confetti-piece confetti-1">🎉</div>
                  <div className="confetti-piece confetti-2">🎊</div>
                  <div className="confetti-piece confetti-3">⭐</div>
                  <div className="confetti-piece confetti-4">🎉</div>
                  <div className="confetti-piece confetti-5">🎊</div>
                  <div className="confetti-piece confetti-6">⭐</div>
                  <div className="confetti-piece confetti-7">🎉</div>
                  <div className="confetti-piece confetti-8">🎊</div>
                  <div className="confetti-piece confetti-9">⭐</div>
                  <div className="confetti-piece confetti-10">🎉</div>
                </div>
              )}
              <h3 className="victory-message">
                {score > opponentScore ? 'You Win!' : score < opponentScore ? 'You lost' : 'It\'s a Tie!'}
              </h3>
              <div className="final-scores-container">
                <div className="player-final-score">
                  <h4>Your Score</h4>
                  <div className="score-display">
                    <span className="score-number">{score}</span>
                    <span className="score-total">/ {totalQuestions * 20}</span>
                  </div>
                  <p className="score-percentage">
                    {Math.round((score / (totalQuestions * 20)) * 100)}% Correct
                  </p>
                </div>
                
                <div className="vs-divider">VS</div>
                
                <div className="opponent-final-score">
                  <h4>Opponent Score</h4>
                  <div className="score-display">
                    <span className="score-number">{opponentScore}</span>
                    <span className="score-total">/ {totalQuestions * 20}</span>
                  </div>
                  <p className="score-percentage">
                    {Math.round((opponentScore / (totalQuestions * 20)) * 100)}% Correct
                  </p>
                </div>
              </div>
              

            </div>

            <div className="game-actions">
              <button className="game-btn restart-btn" onClick={restartGame}>
                🔄 Play Again
              </button>
              <button className="game-btn back-btn" onClick={backToPlaylist}>
                ← Back to Playlists
              </button>
            </div>
          </main>
          
          {/* Competitive Avatars */}
          <div className="avatars">
            <div className="avatar-container player-container">
              <img 
                src="/assets/YourAvatar.png" 
                alt="Your Avatar" 
                className="avatar player-avatar"
              />
            </div>
            
            <div className="avatar-container opponent-container">
              <img 
                src="/assets/OpponentAvatar.png" 
                alt="Opponent Avatar" 
                className="avatar opponent-avatar"
              />
            </div>
          </div>
          
          {/* AI Host Component for Game End */}
          {selectedHost !== 'none' && (
            <AIHost
              ref={aiHostRef}
              gamePhase="game_end"
              playerName={playerName}
              playerScore={score}
              opponentScore={opponentScore}
              songTitle=""
              songArtist=""
              isCorrect={score > opponentScore}
              character={selectedHost}
              enabled={true}
              voiceEnabled={true}
              gameIntroPlaying={false}
            />
          )}

          {/* Sound Effect Audio Elements - Available on Game Complete Screen */}
          <audio 
            ref={correctAnswerSfxRef}
            preload="auto"
          >
            <source src="/assets/sfx_notify_correctAnswer_01.ogg" type="audio/ogg" />
            Your browser does not support the audio element.
          </audio>
          
          <audio 
            ref={victoryApplauseSfxRef}
            preload="auto"
          >
            <source src="/assets/sfx_sq_applause_correct_answer.ogg" type="audio/ogg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      </div>
    )
  }

  return (
    <div className="game-container">
      <div className="game-content">
        <header className="game-header">
          <img 
            src="/assets/Song Quiz Horizontal logo.png" 
            alt="Song Quiz Logo" 
            className="game-logo"
          />
          <div className="quiz-info">
            <div className="quiz-progress">
              <span>Question {questionNumber} of {totalQuestions}</span>
            </div>
            <div className="competitive-scores">
              <div className="player-score">
                <span className="score-label">You:</span>
                <span className="score-value">{score}</span>
              </div>
              <div className="score-divider">|</div>
              <div className="opponent-score">
                <span className="score-label">Opponent:</span>
                <span className="score-value">{opponentScore}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="game-main">
          {/* Game Introduction Screen */}
          {gameIntroPlaying && (
            <div className="game-intro-screen" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              textAlign: 'center',
              padding: '2rem'
            }}>
              <h2 style={{ 
                color: 'white', 
                marginBottom: '1rem',
                fontSize: '1.8rem'
              }}>
                Welcome to {playlist || '2010s'} Song Quiz!
              </h2>
              
              {waitingForHostSpeech ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'white',
                  fontSize: '1.1rem'
                }}>
                  <div className="thinking-dots">
                    <span>•</span>
                    <span>•</span>
                    <span>•</span>
                  </div>
                  Your host is getting ready...
                </div>
              ) : (
                <p style={{ 
                  color: 'white', 
                  fontSize: '1.1rem',
                  opacity: 0.8
                }}>
                  Listen to your AI host introduction, then the music will begin!
                </p>
              )}
            </div>
          )}

          {/* Quiz Section - only show when not in intro */}
          {!gameIntroPlaying && (
          <div className="quiz-section">
            {!showFeedback && (
              <div className="audio-controls">
                <audio
                  ref={audioRef}
                  src={currentQuestion.song.file}
                  onEnded={() => setIsPlaying(false)}
                />
                
                {/* Animated Sound Bars - above progress bar */}
                <div className={`sound-bars-container ${isPlaying ? 'playing' : ''}`}>
                  <div className="sound-bars">
                    <div className="sound-bar bar-1"></div>
                    <div className="sound-bar bar-2"></div>
                    <div className="sound-bar bar-3"></div>
                    <div className="sound-bar bar-4"></div>
                    <div className="sound-bar bar-5"></div>
                    <div className="sound-bar bar-6"></div>
                    <div className="sound-bar bar-7"></div>
                  </div>
                </div>

                <div className="progress-bar">
                  <div className="progress-time">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="progress-track">
                    <div 
                      className="progress-fill"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="control-buttons">
                  <button 
                    className={`control-btn play-pause-btn ${selectedAnswer ? 'disabled' : ''}`}
                    onClick={togglePlayPause}
                    disabled={!!selectedAnswer}
                  >
                    {isPlaying ? '⏸️' : '▶️'}
                  </button>
                </div>
              </div>
            )}

            {/* Speech Recognition Interface - only show during question phase */}
            {speechSupported && speechEnabled && !selectedAnswer && !showFeedback && (
              <div className="speech-recognition-section">
                <p className="speech-instruction">
                  🎤 Speak the name of the song and artist:
                </p>
                <button
                  className={`speech-button ${isListening ? 'listening' : ''}`}
                  onClick={isListening ? handleManualStopRecording : startSpeechRecognition}
                  disabled={!!selectedAnswer}
                >
                  {isListening ? (
                    <>
                      <span className="mic-icon listening">🎤</span>
                      <span className="listening-text">Listening...</span>
                    </>
                  ) : (
                    <>
                      <span className="mic-icon">🎤</span>
                      <span>Start Speaking</span>
                    </>
                  )}
                </button>
              </div>
            )}
            
            {!speechSupported && !showFeedback && (
              <div className="speech-recognition-section">
                <p className="speech-error">
                  Speech recognition is not available. Please configure Deepgram API key.
                </p>
              </div>
            )}

            {/* Results/Feedback Screen - album art with simplified score breakdown */}
            {showFeedback && (
              <div className="feedback-container">
                <div className="album-art-display">
                  <img 
                    src={currentQuestion.song.albumArt} 
                    alt={`${currentQuestion.song.title} album art`}
                    className="album-art"
                  />
                </div>

                <div className="score-breakdown">
                  {pointsEarned > 0 && (
                    <div className="breakdown-details">
                      {artistCorrect && <p>✅ Artist: {currentQuestion.song.artist} (+10 points)</p>}
                      {songCorrect && <p>✅ Song: {currentQuestion.song.title} (+10 points)</p>}
                      {!artistCorrect && pointsEarned > 0 && <p>❌ Artist: {currentQuestion.song.artist}</p>}
                      {!songCorrect && pointsEarned > 0 && <p>❌ Song: {currentQuestion.song.title}</p>}
                    </div>
                  )}
                  {pointsEarned === 0 && (
                    <div className="breakdown-details">
                      <p>The correct answer was:</p>
                      <p><strong>{currentQuestion.song.title}</strong> by <strong>{currentQuestion.song.artist}</strong></p>
                    </div>
                  )}
                </div>


                <button className="next-question-btn" onClick={nextQuestion}>
                  {questionNumber === totalQuestions ? 'Finish Quiz' : 'Next Question →'}
                </button>
              </div>
            )}
          </div>
          )}
        </main>
        
        {/* Competitive Avatars - only show when not in intro */}
        {!gameIntroPlaying && (
        <div className="avatars">
          <div className="avatar-container player-container">
            <img 
              src="/assets/YourAvatar.png" 
              alt="Your Avatar" 
              className={`avatar player-avatar ${showFeedback && isCorrect ? 'celebrating' : ''}`}
            />
            {showFeedback && isCorrect && (
              <>
                <div className="sparkles">
                  <div className="sparkle sparkle-1">✨</div>
                  <div className="sparkle sparkle-2">⭐</div>
                  <div className="sparkle sparkle-3">✨</div>
                  <div className="sparkle sparkle-4">⭐</div>
                  <div className="sparkle sparkle-5">✨</div>
                </div>
                <div className="score-popup player-score-popup">
                  {pointsEarned === 20 ? 'Perfect! +20 Points' :
                   pointsEarned === 10 ? (artistCorrect ? 'Artist Correct! +10 Points' : 'Song Correct! +10 Points') :
                   'Correct! +' + pointsEarned + ' Points'}
                </div>
              </>
            )}
          </div>
          
          <div className="avatar-container opponent-container">
            <img 
              src="/assets/OpponentAvatar.png" 
              alt="Opponent Avatar" 
              className={`avatar opponent-avatar ${showFeedback && opponentCorrect ? 'celebrating' : ''}`}
            />
            {showFeedback && opponentCorrect && (
              <>
                <div className="sparkles">
                  <div className="sparkle sparkle-1">✨</div>
                  <div className="sparkle sparkle-2">⭐</div>
                  <div className="sparkle sparkle-3">✨</div>
                  <div className="sparkle sparkle-4">⭐</div>
                  <div className="sparkle sparkle-5">✨</div>
                </div>
                <div className="score-popup opponent-score-popup">
                  Correct! +{Math.random() < 0.5 ? '10' : '20'} Points
                </div>
              </>
            )}
          </div>
        </div>
        )}
        
        {!gameComplete && selectedHost !== 'none' && !gameIntroPlaying && (
          <AIHost
            ref={aiHostRef}
            gamePhase={hostPhase}
            playerName={playerName}
            playerScore={score}
            opponentScore={opponentScore}
            songTitle={currentQuestion?.song.title}
            songArtist={currentQuestion?.song.artist}
            isCorrect={isCorrect}
            character={selectedHost}
            enabled={true}
            voiceEnabled={true}
            gameIntroPlaying={gameIntroPlaying}
          />
        )}



        <button
          className="back-to-playlists-btn"
          onClick={backToPlaylist}
        >
          ← Back to Playlists
        </button>


      </div>
    </div>
  )
}

export default Game
