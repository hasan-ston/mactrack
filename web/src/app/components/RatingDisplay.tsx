import { Star } from "lucide-react";

interface RatingDisplayProps {
  rating: number;
  maxRating?: number;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
}

export function RatingDisplay({ 
  rating, 
  maxRating = 6, 
  size = "md",
  showNumber = true 
}: RatingDisplayProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  };

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: maxRating }).map((_, index) => {
        const fillPercentage = Math.min(Math.max(rating - index, 0), 1) * 100;
        
        return (
          <div key={index} className="relative">
            <Star className={`${sizeClasses[size]} text-gray-300`} />
            <div 
              className="absolute top-0 left-0 overflow-hidden" 
              style={{ width: `${fillPercentage}%` }}
            >
              <Star className={`${sizeClasses[size]} fill-[#ffc845] text-[#ffc845]`} />
            </div>
          </div>
        );
      })}
      {showNumber && (
        <span className={`${textSizeClasses[size]} font-medium ml-1`}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}