import { Globe, Mail } from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";

const contributors = [
  {
    name: "Muhammad Hasan",
    role: "Lead Developer",
    bio: "Enginnering student at McMaster",
    avatar: "/images/IMG_7679.JPG",
    links: {
      website: "https://hasan-ston.github.io/",
      email: "mailto:mhd.hasan236@gmail.com",
    },
  },
];

export function Contributors() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-extrabold text-foreground mb-4 tracking-tight">
            Meet the Team
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            MacTrack is built by students, for students. We're dedicated to improving the academic experience at McMaster University.
          </p>
        </div>

        {/* Contributors grid */}
        <div className="flex flex-wrap justify-center gap-8">
          {contributors.map((contributor, idx) => (
            <div
              key={idx}
              className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow flex flex-col items-center text-center group"
            >
              <div className="relative w-24 h-24 mb-5">
                <ImageWithFallback
                  src={contributor.avatar}
                  alt={`${contributor.name} — ${contributor.role}`}
                  className="w-24 h-24 rounded-full object-cover [object-position:60%_15%] shadow-sm ring-4 ring-background"
                />
              </div>

              <h3 className="text-xl font-bold text-foreground mb-1">{contributor.name}</h3>
              <p className="text-sm font-medium text-[#7A003C] dark:text-[#ffc845] mb-4">{contributor.role}</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-grow">
                {contributor.bio}
              </p>

              <div className="flex items-center gap-3 mt-auto">
                {contributor.links.website && (
                  <a
                    href={contributor.links.website}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-muted text-muted-foreground hover:text-[#7A003C] hover:bg-accent rounded-full transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {contributor.links.email && (
                  <a
                    href={contributor.links.email}
                    className="p-2 bg-muted text-muted-foreground hover:text-[#EA4335] hover:bg-accent rounded-full transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>


      </div>
    </div>
  );
}
