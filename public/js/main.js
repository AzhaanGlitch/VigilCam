// VigilCam - Client-side JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Auto-hide alert messages after 5 seconds
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        alert.remove();
      }, 500);
    }, 5000);
  });

  // Add click-to-dismiss functionality for alerts
  alerts.forEach(alert => {
    alert.style.cursor = 'pointer';
    alert.addEventListener('click', function() {
      this.style.opacity = '0';
      this.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        this.remove();
      }, 300);
    });
  });

  // Form validation enhancement
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const button = this.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.style.opacity = '0.6';
        const originalText = button.textContent;
        button.textContent = 'Processing...';
        
        // Re-enable after 3 seconds in case of error
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.textContent = originalText;
        }, 3000);
      }
    });
  });

  // Input focus effects
  const inputs = document.querySelectorAll('.form-input');
  inputs.forEach(input => {
    input.addEventListener('focus', function() {
      this.style.transform = 'scale(1.01)';
      this.style.transition = 'transform 0.2s ease';
    });
    
    input.addEventListener('blur', function() {
      this.style.transform = 'scale(1)';
    });
  });

  // Console security message
  console.log('%cVigilCam Security System', 'color: #ffffff; font-size: 20px; font-weight: bold;');
  console.log('%cALWAYS ON WATCH. ZERO BLIND SPOTS.', 'color: #ffffff; font-size: 14px;');
  console.log('%cUnauthorized access is monitored and logged.', 'color: #ff4444; font-size: 12px;');
});