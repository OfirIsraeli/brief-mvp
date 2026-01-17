import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Mail, MessageCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBriefStore } from '@/store/briefStore';
import { VENUES, GENRES, DAYS_OF_WEEK, EVENT_WINDOWS } from '@/types/brief';

const OnboardingStep = ({ 
  children, 
  title, 
  subtitle 
}: { 
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3 }}
    className="w-full"
  >
    <div className="mb-8">
      <h2 className="text-3xl md:text-4xl font-serif mb-2">{title}</h2>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
    {children}
  </motion.div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { onboardingData, setOnboardingData, addBrief, resetOnboarding } = useBriefStore();
  const [step, setStep] = useState(0);
  const [artistInput, setArtistInput] = useState('');

  const totalSteps = 5;

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      // Create the brief
      const newBrief = {
        id: crypto.randomUUID(),
        name: `Brief #${Date.now()}`,
        artists: onboardingData.artists,
        genres: onboardingData.genres,
        venues: onboardingData.venues,
        schedule: onboardingData.schedule,
        deliveryMethod: onboardingData.deliveryMethod,
        deliveryContact: onboardingData.deliveryContact,
        createdAt: new Date(),
        isActive: true,
      };
      addBrief(newBrief);
      resetOnboarding();
      navigate('/dashboard');
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      navigate('/');
    }
  };

  const toggleVenue = (venueId: string) => {
    const venues = onboardingData.venues.includes(venueId)
      ? onboardingData.venues.filter((v) => v !== venueId)
      : [...onboardingData.venues, venueId];
    setOnboardingData({ venues });
  };

  const toggleGenre = (genre: string) => {
    const genres = onboardingData.genres.includes(genre)
      ? onboardingData.genres.filter((g) => g !== genre)
      : [...onboardingData.genres, genre];
    setOnboardingData({ genres });
  };

  const addArtist = () => {
    if (artistInput.trim() && !onboardingData.artists.includes(artistInput.trim())) {
      setOnboardingData({ artists: [...onboardingData.artists, artistInput.trim()] });
      setArtistInput('');
    }
  };

  const removeArtist = (artist: string) => {
    setOnboardingData({ artists: onboardingData.artists.filter((a) => a !== artist) });
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return onboardingData.genres.length > 0 || onboardingData.artists.length > 0;
      case 1:
        return onboardingData.venues.length > 0;
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return onboardingData.deliveryContact.trim().length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 md:p-6 flex items-center justify-between border-b border-border">
        <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-serif text-lg">Brief AI</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {step + 1} / {totalSteps}
        </div>
      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-secondary">
        <motion.div
          className="h-full gradient-gold"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <OnboardingStep
                key="genres"
                title="What do you love?"
                subtitle="Tell us about the artists and genres you want to follow"
              >
                <div className="space-y-6">
                  {/* Artist input */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Specific Artists
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={artistInput}
                        onChange={(e) => setArtistInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addArtist()}
                        placeholder="e.g., Fortis, Infected Mushroom..."
                        className="flex-1"
                      />
                      <Button onClick={addArtist} variant="subtle" size="default">
                        Add
                      </Button>
                    </div>
                    {onboardingData.artists.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {onboardingData.artists.map((artist) => (
                          <span
                            key={artist}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm cursor-pointer hover:bg-primary/30 transition-colors"
                            onClick={() => removeArtist(artist)}
                          >
                            {artist}
                            <span className="text-xs">×</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Genres */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Genres
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {GENRES.map((genre) => (
                        <button
                          key={genre}
                          onClick={() => toggleGenre(genre)}
                          className={`px-4 py-2 rounded-lg border transition-all ${
                            onboardingData.genres.includes(genre)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary border-border hover:border-primary/50'
                          }`}
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </OnboardingStep>
            )}

            {step === 1 && (
              <OnboardingStep
                key="venues"
                title="Where should we look?"
                subtitle="Select the venues and sources you want us to monitor"
              >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {VENUES.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => toggleVenue(venue.id)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        onboardingData.venues.includes(venue.id)
                          ? 'bg-primary/10 border-primary'
                          : 'bg-secondary/50 border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">{venue.name}</h4>
                          <p className="text-xs text-muted-foreground">{venue.category}</p>
                        </div>
                        {onboardingData.venues.includes(venue.id) && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </OnboardingStep>
            )}

            {step === 2 && (
              <OnboardingStep
                key="schedule"
                title="When should we update you?"
                subtitle="Set your preferred notification schedule"
              >
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Day of the week
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day}
                          onClick={() =>
                            setOnboardingData({
                              schedule: { ...onboardingData.schedule, dayOfWeek: day },
                            })
                          }
                          className={`px-4 py-2 rounded-lg border transition-all ${
                            onboardingData.schedule.dayOfWeek === day
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary border-border hover:border-primary/50'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Time
                    </label>
                    <Input
                      type="time"
                      value={onboardingData.schedule.time}
                      onChange={(e) =>
                        setOnboardingData({
                          schedule: { ...onboardingData.schedule, time: e.target.value },
                        })
                      }
                      className="max-w-[150px]"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Event window
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {EVENT_WINDOWS.map((window) => (
                        <button
                          key={window}
                          onClick={() =>
                            setOnboardingData({
                              schedule: { ...onboardingData.schedule, eventWindow: window },
                            })
                          }
                          className={`px-4 py-2 rounded-lg border transition-all ${
                            onboardingData.schedule.eventWindow === window
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary border-border hover:border-primary/50'
                          }`}
                        >
                          {window}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </OnboardingStep>
            )}

            {step === 3 && (
              <OnboardingStep
                key="delivery"
                title="How should we reach you?"
                subtitle="Choose your preferred delivery method"
              >
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setOnboardingData({ deliveryMethod: 'whatsapp' })}
                    className={`p-6 rounded-xl border text-center transition-all ${
                      onboardingData.deliveryMethod === 'whatsapp'
                        ? 'bg-primary/10 border-primary'
                        : 'bg-secondary/50 border-border hover:border-primary/50'
                    }`}
                  >
                    <MessageCircle className={`w-10 h-10 mx-auto mb-3 ${
                      onboardingData.deliveryMethod === 'whatsapp' ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <h4 className="font-medium text-foreground">WhatsApp</h4>
                    <p className="text-xs text-muted-foreground mt-1">Quick & conversational</p>
                  </button>

                  <button
                    onClick={() => setOnboardingData({ deliveryMethod: 'email' })}
                    className={`p-6 rounded-xl border text-center transition-all ${
                      onboardingData.deliveryMethod === 'email'
                        ? 'bg-primary/10 border-primary'
                        : 'bg-secondary/50 border-border hover:border-primary/50'
                    }`}
                  >
                    <Mail className={`w-10 h-10 mx-auto mb-3 ${
                      onboardingData.deliveryMethod === 'email' ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <h4 className="font-medium text-foreground">Email</h4>
                    <p className="text-xs text-muted-foreground mt-1">Detailed digest</p>
                  </button>
                </div>
              </OnboardingStep>
            )}

            {step === 4 && (
              <OnboardingStep
                key="contact"
                title="Almost there!"
                subtitle={`Enter your ${onboardingData.deliveryMethod === 'whatsapp' ? 'phone number' : 'email address'}`}
              >
                <div className="space-y-4">
                  <Input
                    type={onboardingData.deliveryMethod === 'whatsapp' ? 'tel' : 'email'}
                    value={onboardingData.deliveryContact}
                    onChange={(e) => setOnboardingData({ deliveryContact: e.target.value })}
                    placeholder={
                      onboardingData.deliveryMethod === 'whatsapp'
                        ? '+972 50 123 4567'
                        : 'you@example.com'
                    }
                    className="text-lg py-6"
                  />
                  <p className="text-sm text-muted-foreground">
                    We'll send your personalized cultural digest here based on your preferences.
                  </p>
                </div>
              </OnboardingStep>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 md:p-6 border-t border-border">
        <div className="max-w-2xl mx-auto flex justify-between">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button
            variant="hero"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            {step === totalSteps - 1 ? 'Create Brief' : 'Continue'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default Onboarding;
