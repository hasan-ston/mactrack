import requests
import json
import time

def scrape_ratemyprofessors(school_id, num_professors=100):
    """
    Scrape professor data from RateMyProfessors using their GraphQL API
    
    Args:
        school_id: The base64 encoded school ID from RateMyProfessors
        num_professors: Number of professors to scrape (default 100)
    """
    
    professors = []
    
    # Headers to mimic a browser request
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Origin': 'https://www.ratemyprofessors.com',
        'Referer': 'https://www.ratemyprofessors.com/'
    }
    
    # GraphQL endpoint
    graphql_url = "https://www.ratemyprofessors.com/graphql"
    
    # GraphQL query for teacher search
    query = {
        "query": """
        query TeacherSearchResultsPageQuery(
          $query: TeacherSearchQuery!
        ) {
          search: newSearch {
            teachers(query: $query, first: 100) {
              edges {
                cursor
                node {
                  id
                  firstName
                  lastName
                  school {
                    name
                    id
                  }
                  avgRating
                  numRatings
                  department
                  wouldTakeAgainPercent
                  avgDifficulty
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        """,
        "variables": {
            "query": {
                "text": "",
                "schoolID": school_id,
                "fallback": True,
                "departmentID": None
            }
        }
    }
    
    try:
        print(f"Fetching professors from RateMyProfessors...")
        response = requests.post(graphql_url, json=query, headers=headers)
        
        if response.status_code == 200:
            try:
                data = response.json()
            except json.JSONDecodeError:
                print("Failed to parse JSON response")
                print(f"Response text: {response.text[:500]}")
                return professors
            
            # Debug: print response structure
            print(f"Response keys: {data.keys() if isinstance(data, dict) else 'Not a dict'}")
            
            # Parse the response
            if isinstance(data, dict) and 'data' in data:
                if data['data'] and 'search' in data['data'] and data['data']['search']:
                    teachers = data['data']['search']['teachers']['edges']
                    
                    print(f"Found {len(teachers)} professors")
                    
                    for teacher in teachers[:num_professors]:
                        prof_data = teacher['node']
                        professors.append({
                            'id': prof_data.get('id'),
                            'first_name': prof_data.get('firstName'),
                            'last_name': prof_data.get('lastName'),
                            'school': prof_data.get('school', {}).get('name'),
                            'school_id': prof_data.get('school', {}).get('id'),
                            'avg_rating': prof_data.get('avgRating'),
                            'num_ratings': prof_data.get('numRatings'),
                            'department': prof_data.get('department'),
                            'would_take_again_percent': prof_data.get('wouldTakeAgainPercent'),
                            'avg_difficulty': prof_data.get('avgDifficulty')
                        })
                        
                        if len(professors) >= num_professors:
                            break
                            
                    print(f"Successfully scraped {len(professors)} professors")
                else:
                    print("No search results found in response")
                    if 'errors' in data:
                        print(f"API Errors: {json.dumps(data['errors'], indent=2)}")
                    else:
                        print(f"Response data: {json.dumps(data, indent=2)[:1000]}")
            else:
                print("Unexpected response structure")
                print(f"Response: {json.dumps(data, indent=2)[:1000] if isinstance(data, dict) else data}")
        else:
            print(f"Request failed with status code: {response.status_code}")
            print(f"Response: {response.text[:500]}")
        
        # Be respectful - add delay
        time.sleep(1)
        
    except Exception as e:
        print(f"Error scraping data: {e}")
        import traceback
        traceback.print_exc()
    
    return professors

def save_to_json(data, filename='rmp.json'):
    """Save scraped data to JSON file"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\nData saved to {filename}")

if __name__ == "__main__":
    # Example school IDs (base64 encoded):
    # You need to find your specific school ID by:
    # 1. Going to RateMyProfessors.com
    # 2. Searching for your school
    # 3. Opening browser DevTools (F12) -> Network tab
    # 4. Looking at GraphQL requests to find the schoolID
    
    # Example: "U2Nob29sLTEwODE=" 
    # You should replace this with your actual school ID
    school_id = "U2Nob29sLTE0NDA="
    
    print("RateMyProfessors Scraper")
    print("=" * 50)
    print(f"School ID: {school_id}")
    print(f"Target: First 100 professors")
    print("=" * 50)
    
    professors = scrape_ratemyprofessors(school_id, num_professors=100)
    
    if professors:
        save_to_json(professors, 'rmp.json')
        
        # Print summary
        print("\n" + "=" * 50)
        print("SUMMARY")
        print("=" * 50)
        print(f"Total professors scraped: {len(professors)}")
        print(f"\nFirst 5 professors:")
        for i, prof in enumerate(professors[:5], 1):
            print(f"{i}. {prof['first_name']} {prof['last_name']}")
            print(f"   Department: {prof['department']}")
            print(f"   Rating: {prof['avg_rating']} ({prof['num_ratings']} ratings)")
    else:
        print("\nNo professors were scraped. Please check:")
        print("1. The school ID is correct")
        print("2. Your internet connection")
        print("3. RateMyProfessors API hasn't changed")
