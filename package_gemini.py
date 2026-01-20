import os
import shutil
import subprocess
import sys
import zipfile

def package():
    build_dir = "gemini_build"
    zip_file = "gemini_handler.zip"
    requirements_file = "requirements.txt"
    handler_file = "gemini_handler.py"

    print("🚀 Starting Zero-Cost Lambda Packaging (Python Edition)...")

    # 1. Cleanup
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    if os.path.exists(zip_file):
        os.remove(zip_file)
    os.makedirs(build_dir)

    # 2. Install dependencies (Force Linux x86_64 for Lambda compatibility)
    print(f"📦 Installing dependencies from {requirements_file}...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            "--target", build_dir, 
            "-r", requirements_file, 
            "--no-cache-dir",
            "--platform", "manylinux2014_x86_64",
            "--only-binary=:all:",
            "--implementation", "cp",
            "--python-version", "3.12"
        ])
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        # Fallback to standard install if platform-specific fails (though risky for binaries)
        print("⚠️ Retrying with standard install...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            "--target", build_dir, 
            "-r", requirements_file, 
            "--no-cache-dir"
        ])

    # 3. Copy handler
    print(f"📄 Copying {handler_file}...")
    shutil.copy(handler_file, os.path.join(build_dir, handler_file))

    # 4. Create ZIP
    print(f"🤐 Creating {zip_file}...")
    with zipfile.ZipFile(zip_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(build_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, build_dir)
                zf.write(full_path, rel_path)

    size = os.path.getsize(zip_file) / (1024 * 1024)
    print(f"✅ Packaging complete: {zip_file} ({size:.2f} MB)")

if __name__ == "__main__":
    package()
