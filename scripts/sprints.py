"""Bundle the grids and scheduled distances of the six 2025 Sprint races."""
from season import JOL, OUT, fetch, save

def main():
    weekends = {}
    for rnd, laps in [(2,19),(6,19),(13,15),(19,19),(21,24),(23,19)]:
        event = fetch(f'sprint-{rnd}', JOL + f'/{rnd}/sprint.json')['MRData']['RaceTable']['Races'][0]
        drivers = sorted(event['SprintResults'], key=lambda v:int(v['grid']) or 99)
        weekends[rnd] = {'laps':laps,'grid':[row['Driver']['code'] for row in drivers]}
    save(OUT/'sprints.json', weekends)
if __name__ == '__main__':
    main()
