import { Hero } from '@/components/landing/Hero';
import { DigestPreview } from '@/components/landing/DigestPreview';
import { VenueGrid } from '@/components/landing/VenueGrid';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <DigestPreview />
      <VenueGrid />
      
      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <h3 className="font-serif text-2xl text-gradient-gold mb-2">Brief AI</h3>
          <p className="text-muted-foreground text-sm">
            Your personal cultural scout for Tel Aviv
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
