import { motion } from 'framer-motion';
import { VENUES } from '@/types/brief';

export const VenueGrid = () => {
  return (
    <section className="py-24 px-4 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-serif mb-4">
            We scout <span className="text-gradient-gold italic">everywhere</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From legendary venues to underground galleries, we monitor the pulse of Tel Aviv's cultural scene
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {VENUES.map((venue, i) => (
            <motion.div
              key={venue.id}
              className="glass-card rounded-xl p-5 hover:border-primary/30 transition-all hover:scale-[1.02] cursor-default"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <h3 className="font-semibold text-foreground mb-1">{venue.name}</h3>
              <p className="text-xs text-muted-foreground">{venue.category}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
