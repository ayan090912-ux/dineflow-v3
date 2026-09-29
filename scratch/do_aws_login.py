import subprocess
import re
import time
import sys

p = subprocess.Popen(['aws', 'login'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
url = None
start = time.time()
while time.time() - start < 10:
    line = p.stdout.readline()
    if line:
        print(line, end='', flush=True)
        m = re.search(r'https://\S+', line)
        if m:
            url = m.group(0)
            with open("scratch/aws_login_url.txt", "w") as f:
                f.write(url)
            break
    time.sleep(0.1)

print("\nURL captured:", url)
out, err = p.communicate()
print("Process finished with returncode:", p.returncode)
print("STDOUT:", out)
print("STDERR:", err)
