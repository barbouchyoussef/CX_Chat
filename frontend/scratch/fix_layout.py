import re

path = r"c:\Users\HAMZA\Desktop\EY\CX_Chat\frontend\src\components\ui\client-interview-hub.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Let's find the exact block we want to replace.
# The block starts after Section 3's closing bracket, which is:
#                 )}
#               </div>
#             </div>
# 
#           </div>
# and then contains the leftovers:
#                           {isFrench ? "Charger" : "Load"}
#                         </button>
#                       ...
#             </div>
#           )}
# and then followed by:
#          </div>
#        </div>
#      </div>
#    );
#    }

pattern = r'(\s+)\{guide && guide\.company_name && step === "form" && \([\s\S]+?\}\)\}\s+<\/div>\s+<\/div>\s+<\/div>\s+([ \t]*)\{isFrench \? "Charger" : "Load"\}[\s\S]+?\}\)\}\s+<\/div>\s+<\/div>\s+([ \t]*)\}\)'

# Let's inspect what is there around line 1060 to 1090
lines = content.splitlines()
for idx, line in enumerate(lines[1050:1100], start=1051):
    print(f"{idx}: {repr(line)}")

