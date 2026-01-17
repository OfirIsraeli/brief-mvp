import { motion } from 'framer-motion';
import { ExternalLink, Flame, MapPin, Sparkles } from 'lucide-react';

export const DigestPreview = () => {
  return (
    <section className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif mb-4">
            Your <span className="text-gradient-gold italic">Micro-Digest</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            A curated glimpse of what's happening, delivered your way
          </p>
        </motion.div>

        <motion.div
          className="glass-card rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {/* Header */}
          <div className="gradient-gold p-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
              <div>
                <h3 className="font-semibold text-primary-foreground text-lg">
                  Brief AI: Your Weekend in Tel Aviv
                </h3>
                <p className="text-primary-foreground/80 text-sm">
                  Thursday, 4:00 PM • 3 events matched
                </p>
              </div>
            </div>
          </div>

          {/* Events */}
          <div className="divide-y divide-border">
            {/* High Match */}
            <div className="p-6 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg gradient-gold flex items-center justify-center flex-shrink-0">
                  <Flame className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      High Match
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">
                    Fortis at Barby
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Saturday, 9:00 PM • Just announced!
                  </p>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    Get Tickets <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Neighborhood */}
            <div className="p-6 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      Around Your Neighborhood
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">
                    Rooftop Jazz Session
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Friday, 9:00 PM • Florentin
                  </p>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    Learn More <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Look */}
            <div className="p-6 hover:bg-secondary/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      Quick Look
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">
                    3 New Gallery Openings in Kiryat HaMelacha
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Thursday - Saturday • Free entry
                  </p>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    See All <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
